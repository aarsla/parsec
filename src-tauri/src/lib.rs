mod frontmost;
mod history;
mod hotkey;
mod paster;
mod recorder;
mod state;
mod transcriber;

use state::{AppState, Status};
use tauri_plugin_store::StoreExt;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
    utils::config::Color,
    Emitter, Listener, Manager, WebviewUrl, WebviewWindowBuilder, image::Image,
};

const TRAY_ICON_NORMAL: &[u8] = include_bytes!("../icons/tray-icon.png");
const TRAY_ICON_RECORDING: &[u8] = include_bytes!("../icons/tray-icon-recording.png");

#[tauri::command]
fn get_input_devices() -> Vec<String> {
    recorder::list_input_devices()
}

#[tauri::command]
fn get_app_status(state: tauri::State<'_, AppState>) -> String {
    state.status().to_string()
}

#[tauri::command]
async fn start_recording(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    recorder::start_recording(&app, &state).map_err(|e| e.to_string())
}

#[tauri::command]
async fn stop_recording(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    // Capture frontmost app before any processing
    let (app_name, window_title) = frontmost::get_frontmost_app();

    let wav_path = recorder::stop_recording(&state).map_err(|e| e.to_string())?;

    state.set_status(state::Status::Transcribing);
    let _ = app.emit("status-changed", "transcribing");

    let text = transcriber::transcribe(&app, &wav_path)
        .await
        .map_err(|e| e.to_string())?;

    if !text.is_empty() {
        // Save to history
        let entry = history::HistoryEntry {
            id: uuid::Uuid::new_v4().to_string(),
            text: text.clone(),
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as i64,
            app_name,
            window_title,
            char_count: text.chars().count(),
        };
        history::add_entry(&app, entry);

        paster::paste_text(&text).map_err(|e| e.to_string())?;
    }

    state.set_status(state::Status::Idle);
    let _ = app.emit("status-changed", "idle");

    Ok(text)
}

#[tauri::command]
async fn cancel_recording(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    recorder::cancel_recording(&state).map_err(|e| e.to_string())?;
    let _ = app.emit("status-changed", "idle");
    Ok(())
}

#[tauri::command]
fn get_current_hotkey(state: tauri::State<'_, AppState>) -> String {
    state.hotkey()
}

#[tauri::command]
fn set_hotkey(app: tauri::AppHandle, state: tauri::State<'_, AppState>, shortcut: String) -> Result<(), String> {
    hotkey::update_hotkey(&app, &shortcut).map_err(|e| e.to_string())?;
    state.set_hotkey(shortcut);
    Ok(())
}

#[tauri::command]
fn check_microphone_permission() -> String {
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
fn request_microphone_permission() {
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
fn check_accessibility_permission() -> String {
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
fn request_accessibility_permission() -> String {
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
fn get_history(app: tauri::AppHandle) -> Vec<history::HistoryEntry> {
    history::get_entries(&app)
}

#[tauri::command]
fn delete_history_entry(app: tauri::AppHandle, id: String) {
    history::delete_entry(&app, &id);
}

#[tauri::command]
fn clear_history(app: tauri::AppHandle) {
    history::clear_entries(&app);
}

#[tauri::command]
fn set_dock_visible(app: tauri::AppHandle, visible: bool) -> Result<(), String> {
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
fn open_privacy_settings(pane: String) {
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        let url = match pane.as_str() {
            "microphone" => "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
            "accessibility" => "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
            _ => return,
        };
        let _ = Command::new("open").arg(url).spawn();
    }
}

#[derive(serde::Serialize)]
struct WorkArea {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[tauri::command]
fn get_work_area_at_cursor() -> Option<WorkArea> {
    #[cfg(target_os = "macos")]
    {
        macos_work_area_at_cursor()
    }
    #[cfg(not(target_os = "macos"))]
    {
        None
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
struct ModelInfo {
    ready: bool,
    path: String,
    size_bytes: u64,
    name: String,
    version: String,
    quantization: String,
}

#[tauri::command]
fn get_model_status() -> ModelInfo {
    ModelInfo {
        ready: transcriber::models_ready(),
        path: transcriber::model_dir().to_string_lossy().to_string(),
        size_bytes: transcriber::model_disk_size(),
        name: "Parakeet TDT".to_string(),
        version: "0.6b v3".to_string(),
        quantization: "int8".to_string(),
    }
}

#[tauri::command]
async fn download_model(app: tauri::AppHandle) -> Result<(), String> {
    transcriber::ensure_model(&app).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_model() -> Result<(), String> {
    transcriber::delete_model().await.map_err(|e| e.to_string())
}

#[derive(serde::Serialize)]
struct OnboardingStatus {
    model_ready: bool,
    mic_granted: bool,
    accessibility_granted: bool,
}

#[tauri::command]
fn check_onboarding_needed() -> OnboardingStatus {
    let mic = check_microphone_permission();
    let a11y = check_accessibility_permission();
    OnboardingStatus {
        model_ready: transcriber::models_ready(),
        mic_granted: mic == "granted",
        accessibility_granted: a11y == "granted",
    }
}

#[tauri::command]
fn is_download_in_progress() -> bool {
    transcriber::is_downloading()
}

fn create_overlay_window(app: &tauri::AppHandle) -> tauri::Result<()> {
    let existing = app.get_webview_window("overlay");
    if existing.is_some() {
        return Ok(());
    }

    WebviewWindowBuilder::new(app, "overlay", WebviewUrl::App("/overlay".into()))
        .title("AudioShift Recording")
        .inner_size(320.0, 96.0)
        .resizable(false)
        .decorations(false)
        .always_on_top(true)
        .transparent(true)
        .visible(false)
        .focused(false)
        .skip_taskbar(true)
        .build()?;

    Ok(())
}

fn create_settings_window(app: &tauri::AppHandle) -> tauri::Result<()> {
    if let Some(win) = app.get_webview_window("settings") {
        let _ = win.show();
        let _ = win.set_focus();
        return Ok(());
    }

    let mut builder = WebviewWindowBuilder::new(app, "settings", WebviewUrl::App("/settings".into()))
        .title("AudioShift")
        .min_inner_size(520.0, 400.0)
        .resizable(true)
        .background_color(Color(32, 32, 32, 255));

    // Restore saved geometry or center with defaults
    let store = app.store("settings.json").ok();
    let geom = store.as_ref().and_then(|s| {
        let x = s.get("settingsGeometry")?;
        let obj = x.as_object()?;
        Some((
            obj.get("x")?.as_f64()?,
            obj.get("y")?.as_f64()?,
            obj.get("w")?.as_f64()?,
            obj.get("h")?.as_f64()?,
        ))
    });

    if let Some((x, y, w, h)) = geom {
        builder = builder
            .inner_size(w, h)
            .position(x, y);
    } else {
        builder = builder
            .inner_size(800.0, 600.0)
            .center();
    }

    builder.build()?;
    Ok(())
}

fn create_onboarding_window(app: &tauri::AppHandle) -> tauri::Result<()> {
    if let Some(win) = app.get_webview_window("onboarding") {
        let _ = win.show();
        let _ = win.set_focus();
        return Ok(());
    }

    WebviewWindowBuilder::new(app, "onboarding", WebviewUrl::App("/onboarding".into()))
        .title("AudioShift Setup")
        .inner_size(520.0, 440.0)
        .resizable(false)
        .center()
        .background_color(Color(32, 32, 32, 255))
        .build()?;

    Ok(())
}

fn status_menu_text(status: Status, hotkey: &str) -> String {
    let hint = hotkey_display_hint(hotkey);
    match status {
        Status::Idle => format!("Ready to Record ({})", hint),
        Status::Recording => format!("Recording... ({} to stop)", hint),
        Status::Transcribing => "Transcribing...".to_string(),
    }
}

fn hotkey_display_hint(hotkey: &str) -> String {
    hotkey
        .replace("CmdOrCtrl", "\u{2318}")
        .replace("Shift", "\u{21E7}")
        .replace("Space", "Space")
        .replace("+", "")
}

fn update_tray_for_status(app: &tauri::AppHandle, status: Status) {
    let state = app.state::<AppState>();

    // Update icon
    if let Some(tray) = state.tray() {
        let icon_bytes = match status {
            Status::Recording => TRAY_ICON_RECORDING,
            _ => TRAY_ICON_NORMAL,
        };
        if let Ok(icon) = Image::from_bytes(icon_bytes) {
            let _ = tray.set_icon(Some(icon));
        }
    }

    // Update status menu item text
    if let Some(status_item) = state.tray_status_item() {
        let text = status_menu_text(status, &state.hotkey());
        let _ = status_item.set_text(text);
    }
}

fn onboarding_needed(app: &tauri::AppHandle) -> bool {
    let store = app.store("settings.json").ok();
    let completed = store
        .as_ref()
        .and_then(|s| s.get("onboardingCompleted"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    if completed {
        return false;
    }
    let model = transcriber::models_ready();
    let mic = check_microphone_permission() == "granted";
    let a11y = check_accessibility_permission() == "granted";
    !model || !mic || !a11y
}

#[tauri::command]
fn complete_onboarding(app: tauri::AppHandle) {
    if let Ok(store) = app.store("settings.json") {
        let _ = store.set("onboardingCompleted", serde_json::json!(true));
    }
}

#[tauri::command]
fn show_onboarding(app: tauri::AppHandle) {
    let _ = create_onboarding_window(&app);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::AppleScript,
            None,
        ))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            get_input_devices,
            get_app_status,
            start_recording,
            stop_recording,
            cancel_recording,
            get_current_hotkey,
            set_hotkey,
            check_microphone_permission,
            request_microphone_permission,
            check_accessibility_permission,
            request_accessibility_permission,
            open_privacy_settings,
            set_dock_visible,
            get_work_area_at_cursor,
            get_history,
            delete_history_entry,
            clear_history,
            get_model_status,
            download_model,
            delete_model,
            check_onboarding_needed,
            complete_onboarding,
            show_onboarding,
            is_download_in_progress,
        ])
        .setup(|app| {
            // Create overlay window (hidden by default)
            create_overlay_window(&app.handle())?;

            // Build tray menu
            let state = app.state::<AppState>();
            let status_text = status_menu_text(Status::Idle, &state.hotkey());

            let status_item = MenuItemBuilder::with_id("status", &status_text)
                .enabled(false)
                .build(app)?;
            let settings_item =
                MenuItemBuilder::with_id("settings", "Settings").build(app)?;
            let updates_item =
                MenuItemBuilder::with_id("updates", "Check for Updates...").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "Quit AudioShift").build(app)?;
            let menu = MenuBuilder::new(app)
                .item(&status_item)
                .separator()
                .item(&settings_item)
                .item(&updates_item)
                .separator()
                .item(&quit_item)
                .build()?;

            // Build tray icon
            let tray = TrayIconBuilder::new()
                .icon(Image::from_bytes(TRAY_ICON_NORMAL).expect("failed to load tray icon"))
                .icon_as_template(true)
                .menu(&menu)
                .tooltip("AudioShift")
                .on_menu_event(move |app, event| match event.id().as_ref() {
                    "settings" => {
                        let _ = create_settings_window(app);
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

            // Store tray handle for dynamic updates
            app.state::<AppState>().set_tray(tray, status_item);

            // Listen for status changes to update tray
            let handle = app.handle().clone();
            app.listen("status-changed", move |event| {
                let status = match event.payload().trim_matches('"') {
                    "recording" => Status::Recording,
                    "transcribing" => Status::Transcribing,
                    _ => Status::Idle,
                };
                update_tray_for_status(&handle, status);
            });

            // Listen for download progress to update tray status text
            let handle = app.handle().clone();
            app.listen("model-download-progress", move |event| {
                let state = handle.state::<AppState>();
                if let Some(status_item) = state.tray_status_item() {
                    if let Ok(payload) = serde_json::from_str::<serde_json::Value>(event.payload()) {
                        let file = payload.get("file").and_then(|v| v.as_str()).unwrap_or("");
                        if file == "complete" {
                            let text = status_menu_text(Status::Idle, &state.hotkey());
                            let _ = status_item.set_text(text);
                        } else {
                            let overall_downloaded = payload.get("overall_downloaded").and_then(|v| v.as_u64()).unwrap_or(0);
                            let overall_total = payload.get("overall_total").and_then(|v| v.as_u64()).unwrap_or(0);
                            let dl_mb = overall_downloaded / (1024 * 1024);
                            let total_mb = overall_total / (1024 * 1024);
                            if total_mb > 0 {
                                let _ = status_item.set_text(format!("Downloading model... {} / {} MB", dl_mb, total_mb));
                            } else {
                                let _ = status_item.set_text("Downloading model...".to_string());
                            }
                        }
                    }
                }
            });

            // Check if onboarding is needed
            if onboarding_needed(&app.handle()) {
                let _ = create_onboarding_window(&app.handle());
                // Download is triggered by the onboarding frontend after its
                // event listener is ready — no background spawn here.
            }

            // Register global hotkey (restore saved or use default)
            let saved_hotkey = app
                .store("settings.json")
                .ok()
                .and_then(|s| s.get("hotkey"))
                .and_then(|v| v.as_str().map(String::from));

            if let Some(ref key) = saved_hotkey {
                hotkey::update_hotkey(&app.handle(), key)?;
                app.state::<AppState>().set_hotkey(key.clone());
            } else {
                hotkey::register_default_hotkey(app)?;
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
