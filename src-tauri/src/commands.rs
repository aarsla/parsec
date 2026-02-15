use crate::{escape_monitor, frontmost, history, model_registry, paster, recorder, state, transcriber};
use crate::state::AppState;
use tauri::Emitter;
use tauri_plugin_store::StoreExt;

#[tauri::command]
pub fn get_input_devices() -> Vec<String> {
    recorder::list_input_devices()
}

#[tauri::command]
pub async fn start_monitor(app: tauri::AppHandle, device: Option<String>) -> Result<(), String> {
    recorder::start_monitor(&app, device.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn stop_monitor() {
    recorder::stop_monitor();
}

#[tauri::command]
pub fn get_app_status(state: tauri::State<'_, AppState>) -> String {
    state.status().to_string()
}

#[tauri::command]
pub async fn start_recording(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let device_name = app
        .store("settings.json")
        .ok()
        .and_then(|s| s.get("inputDevice"))
        .and_then(|v| v.as_str().map(String::from))
        .filter(|name| name != "default");
    recorder::start_recording(&app, &state, device_name.as_deref()).map_err(|e| e.to_string())?;
    escape_monitor::start(&app);
    Ok(())
}

#[tauri::command]
pub async fn stop_recording(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    auto_paste: bool,
) -> Result<String, String> {
    // Capture frontmost app before any processing
    let (app_name, window_title) = frontmost::get_frontmost_app();

    escape_monitor::stop();
    let samples = recorder::stop_recording(&state).map_err(|e| e.to_string())?;

    state.set_status(state::Status::Transcribing);
    let _ = app.emit("status-changed", "transcribing");

    let store = app.store("settings.json").ok();

    let live_model = store
        .as_ref()
        .and_then(|s| s.get("liveModel"))
        .and_then(|v| v.as_str().map(String::from))
        .unwrap_or_else(|| model_registry::DEFAULT_MODEL_ID.to_string());

    // Read language settings (only meaningful for Whisper models)
    let language = store
        .as_ref()
        .and_then(|s| s.get("transcriptionLanguage"))
        .and_then(|v| v.as_str().map(String::from))
        .unwrap_or_else(|| "auto".to_string());
    let language = if language == "auto" { None } else { Some(language) };

    let translate = store
        .as_ref()
        .and_then(|s| s.get("translateToEnglish"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let save_history = store
        .as_ref()
        .and_then(|s| s.get("saveHistory"))
        .and_then(|v| v.as_bool())
        .unwrap_or(true);

    // Clone samples before transcription (transcriber consumes them) so we can save audio
    let samples_for_save = if save_history { Some(samples.clone()) } else { None };
    let duration_ms = (samples.len() as u64 * 1000) / 16000;

    let transcribe_start = std::time::Instant::now();
    let text = transcriber::transcribe_from_samples(&app, samples, &live_model, language.clone(), translate)
        .await
        .map_err(|e| e.to_string())?;
    let processing_time_ms = transcribe_start.elapsed().as_millis() as u64;

    if !text.is_empty() {
        if save_history {
            if let Some(audio_samples) = samples_for_save {
                history::add_entry(&app, history::RecordingInfo {
                    samples: audio_samples,
                    text: text.clone(),
                    app_name,
                    window_title,
                    duration_ms,
                    processing_time_ms,
                    model_id: live_model.clone(),
                    language,
                    translate,
                });
            }
        }

        if auto_paste {
            paster::paste_text(&text).map_err(|e| e.to_string())?;
        } else {
            paster::copy_to_clipboard(&text).map_err(|e| e.to_string())?;
        }
    }

    // Emit result for listeners (e.g. onboarding test)
    let _ = app.emit("transcription-complete", &text);

    state.set_status(state::Status::Idle);
    let _ = app.emit("status-changed", "idle");

    Ok(text)
}

#[tauri::command]
pub async fn cancel_recording(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    escape_monitor::stop();
    recorder::cancel_recording(&state).map_err(|e| e.to_string())?;
    let _ = app.emit("status-changed", "idle");
    Ok(())
}

#[tauri::command]
pub fn get_current_hotkey(state: tauri::State<'_, AppState>) -> String {
    state.hotkey()
}

#[tauri::command]
pub fn set_hotkey(app: tauri::AppHandle, state: tauri::State<'_, AppState>, shortcut: String) -> Result<(), String> {
    crate::hotkey::update_hotkey(&app, &shortcut).map_err(|e| e.to_string())?;
    state.set_hotkey(shortcut);
    Ok(())
}

#[tauri::command]
pub fn check_microphone_permission() -> String {
    #[cfg(target_os = "macos")]
    {
        extern "C" {
            fn check_mic_auth_status() -> i32;
        }
        let status = unsafe { check_mic_auth_status() };
        match status {
            3 => "granted".to_string(),
            0 => "not_determined".to_string(),
            _ => "denied".to_string(),
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        "granted".to_string()
    }
}

#[tauri::command]
pub fn request_microphone_permission() {
    #[cfg(target_os = "macos")]
    {
        let status = check_microphone_permission();
        if status == "not_determined" {
            // First time: show the native macOS permission prompt
            extern "C" {
                fn request_mic_access();
            }
            unsafe { request_mic_access(); }
        } else if status != "granted" {
            // Already denied/toggled off: open System Settings
            open_privacy_settings("microphone".to_string());
        }
    }
}

#[tauri::command]
pub fn check_accessibility_permission() -> String {
    #[cfg(target_os = "macos")]
    {
        if macos_accessibility_client::accessibility::application_is_trusted() {
            "granted".to_string()
        } else {
            "denied".to_string()
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        "granted".to_string()
    }
}

#[tauri::command]
pub fn request_accessibility_permission() -> String {
    #[cfg(target_os = "macos")]
    {
        let status = check_accessibility_permission();
        if status == "granted" {
            return "granted".to_string();
        }
        // application_is_trusted_with_prompt only shows the prompt once;
        // after that macOS silently returns false, so open System Settings
        if macos_accessibility_client::accessibility::application_is_trusted_with_prompt() {
            "granted".to_string()
        } else {
            open_privacy_settings("accessibility".to_string());
            "denied".to_string()
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        "granted".to_string()
    }
}

#[tauri::command]
pub fn get_history(app: tauri::AppHandle) -> Vec<history::HistoryEntry> {
    history::get_entries(&app)
}

#[tauri::command]
pub fn delete_history_entry(app: tauri::AppHandle, id: String) {
    history::delete_entry(&app, &id);
}

#[tauri::command]
pub fn clear_history(app: tauri::AppHandle) {
    history::clear_entries(&app);
}

#[tauri::command]
pub fn set_dock_visible(app: tauri::AppHandle, visible: bool) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        app.set_dock_visibility(visible).map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, visible);
        Ok(())
    }
}

#[tauri::command]
#[allow(unused_variables)]
pub fn open_privacy_settings(pane: String) {
    #[cfg(target_os = "macos")]
    {
        use objc2_foundation::NSString;

        let url = match pane.as_str() {
            "microphone" => "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
            "accessibility" => "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
            _ => return,
        };

        unsafe {
            let url_ns = NSString::from_str(url);
            let nsurl: *mut objc2::runtime::AnyObject =
                objc2::msg_send![objc2::class!(NSURL), URLWithString: &*url_ns];
            if !nsurl.is_null() {
                let workspace: *mut objc2::runtime::AnyObject =
                    objc2::msg_send![objc2::class!(NSWorkspace), sharedWorkspace];
                let _: bool = objc2::msg_send![workspace, openURL: nsurl];
            }
        }
    }
}

#[derive(serde::Serialize)]
pub struct WorkArea {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[tauri::command]
pub fn get_work_area_at_cursor() -> Option<WorkArea> {
    #[cfg(target_os = "macos")]
    {
        macos_work_area_at_cursor()
    }
    #[cfg(target_os = "windows")]
    {
        windows_work_area_at_cursor()
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        None
    }
}

#[cfg(target_os = "windows")]
fn windows_work_area_at_cursor() -> Option<WorkArea> {
    use windows::Win32::Graphics::Gdi::{MonitorFromPoint, GetMonitorInfoW, MONITORINFO, MONITOR_DEFAULTTONEAREST};
    use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;
    use windows::Win32::Foundation::POINT;

    unsafe {
        let mut cursor = POINT::default();
        GetCursorPos(&mut cursor).ok()?;  // returns Result<()>

        let hmonitor = MonitorFromPoint(cursor, MONITOR_DEFAULTTONEAREST);
        let mut info = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        GetMonitorInfoW(hmonitor, &mut info).ok().ok()?;  // returns BOOL

        let rc = info.rcWork;
        Some(WorkArea {
            x: rc.left as f64,
            y: rc.top as f64,
            width: (rc.right - rc.left) as f64,
            height: (rc.bottom - rc.top) as f64,
        })
    }
}

#[cfg(target_os = "macos")]
fn macos_work_area_at_cursor() -> Option<WorkArea> {
    #[repr(C)]
    struct ScreenRect {
        x: f64,
        y: f64,
        width: f64,
        height: f64,
    }

    extern "C" {
        fn get_usable_bounds_at_cursor() -> ScreenRect;
    }

    let r = unsafe { get_usable_bounds_at_cursor() };
    Some(WorkArea {
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
    })
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelStatusEntry {
    id: String,
    name: String,
    engine: model_registry::Engine,
    description: String,
    size_label: String,
    ready: bool,
    disk_size: u64,
    path: String,
}

#[tauri::command]
pub fn get_all_models_status() -> Vec<ModelStatusEntry> {
    model_registry::MODELS
        .iter()
        .map(|m| ModelStatusEntry {
            id: m.id.to_string(),
            name: m.name.to_string(),
            engine: m.engine,
            description: m.description.to_string(),
            size_label: model_registry::size_label(m.approx_bytes),
            ready: model_registry::model_ready(m.id),
            disk_size: model_registry::model_disk_size(m.id),
            path: model_registry::model_dir(m.id).to_string_lossy().to_string(),
        })
        .collect()
}

#[tauri::command]
pub async fn download_model(app: tauri::AppHandle, model_id: String) -> Result<(), String> {
    transcriber::ensure_model(&app, &model_id).await.map_err(|e| e.to_string())?;

    // Preload into memory so first transcription (e.g. onboarding test) is instant
    let handle = app.clone();
    let mid = model_id.clone();
    let _ = app.emit("model-preload-start", &model_id);
    tauri::async_runtime::spawn(async move {
        tokio::task::spawn_blocking(move || {
            if let Err(e) = transcriber::preload_model(&mid) {
                eprintln!("[audioshift] Model preload after download failed: {}", e);
            }
        }).await.ok();
        let _ = handle.emit("model-preload-done", ());
    });

    Ok(())
}

#[tauri::command]
pub async fn delete_model(model_id: String) -> Result<(), String> {
    transcriber::delete_model(&model_id).await.map_err(|e| e.to_string())
}

#[derive(serde::Serialize)]
pub struct OnboardingStatus {
    model_ready: bool,
    mic_granted: bool,
    accessibility_granted: bool,
}

#[tauri::command]
pub fn check_onboarding_needed() -> OnboardingStatus {
    let mic = check_microphone_permission();
    let a11y = check_accessibility_permission();
    OnboardingStatus {
        model_ready: model_registry::any_model_ready(),
        mic_granted: mic == "granted",
        accessibility_granted: a11y == "granted",
    }
}

#[tauri::command]
pub fn get_live_model(app: tauri::AppHandle) -> String {
    app.store("settings.json")
        .ok()
        .and_then(|s| s.get("liveModel"))
        .and_then(|v| v.as_str().map(String::from))
        .unwrap_or_else(|| model_registry::DEFAULT_MODEL_ID.to_string())
}

#[tauri::command]
pub fn set_live_model(app: tauri::AppHandle, model_id: String) -> Result<(), String> {
    let store = app.store("settings.json").map_err(|e| e.to_string())?;
    store.set("liveModel", serde_json::json!(model_id));
    let _ = app.emit("live-model-changed", &model_id);

    // Preload in background so first transcription is instant
    let handle = app.clone();
    let mid = model_id.clone();
    let _ = app.emit("model-preload-start", &model_id);
    tauri::async_runtime::spawn(async move {
        tokio::task::spawn_blocking(move || {
            if let Err(e) = transcriber::preload_model(&mid) {
                eprintln!("[audioshift] Model preload failed: {}", e);
            }
        }).await.ok();
        let _ = handle.emit("model-preload-done", ());
    });

    Ok(())
}

#[tauri::command]
pub fn get_transcription_language(app: tauri::AppHandle) -> String {
    app.store("settings.json")
        .ok()
        .and_then(|s| s.get("transcriptionLanguage"))
        .and_then(|v| v.as_str().map(String::from))
        .unwrap_or_else(|| "auto".to_string())
}

#[tauri::command]
pub fn set_transcription_language(app: tauri::AppHandle, language: String) -> Result<(), String> {
    let store = app.store("settings.json").map_err(|e| e.to_string())?;
    store.set("transcriptionLanguage", serde_json::json!(language));
    let _ = app.emit("transcription-language-changed", &language);
    Ok(())
}

#[tauri::command]
pub fn get_translate_to_english(app: tauri::AppHandle) -> bool {
    app.store("settings.json")
        .ok()
        .and_then(|s| s.get("translateToEnglish"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}

#[tauri::command]
pub fn set_translate_to_english(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    let store = app.store("settings.json").map_err(|e| e.to_string())?;
    store.set("translateToEnglish", serde_json::json!(enabled));
    let _ = app.emit("translate-to-english-changed", enabled);
    Ok(())
}

#[tauri::command]
pub fn is_download_in_progress() -> bool {
    transcriber::is_downloading()
}

#[tauri::command]
pub fn complete_onboarding(app: tauri::AppHandle) {
    if let Ok(store) = app.store("settings.json") {
        let _ = store.set("onboardingCompleted", serde_json::json!(true));
    }
}

#[tauri::command]
pub fn show_onboarding(app: tauri::AppHandle) {
    let _ = crate::windows::create_onboarding_window(&app);
}

#[tauri::command]
pub fn restart_app(app: tauri::AppHandle) {
    // Delay restart to avoid deadlock when called from IPC handler
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(200));
        app.restart();
    });
}

#[tauri::command]
pub fn get_build_variant() -> String {
    if cfg!(feature = "mas") {
        "mas".to_string()
    } else {
        "direct".to_string()
    }
}

