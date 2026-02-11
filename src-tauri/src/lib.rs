mod frontmost;
mod history;
mod hotkey;
mod paster;
mod recorder;
mod state;
mod transcriber;

use state::{AppState, Status};
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
        use cpal::traits::HostTrait;
        let host = cpal::default_host();
        match host.default_input_device() {
            Some(_) => "granted".to_string(),
            None => "unknown".to_string(),
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        "granted".to_string()
    }
}

#[tauri::command]
fn check_accessibility_permission() -> String {
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        let output = Command::new("osascript")
            .args(["-e", "tell application \"System Events\" to return name of first process"])
            .output();
        match output {
            Ok(o) if o.status.success() => "granted".to_string(),
            _ => "denied".to_string(),
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
    app.set_dock_visibility(visible).map_err(|e| e.to_string())
}

#[tauri::command]
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

fn create_overlay_window(app: &tauri::AppHandle) -> tauri::Result<()> {
    let existing = app.get_webview_window("overlay");
    if existing.is_some() {
        return Ok(());
    }

    WebviewWindowBuilder::new(app, "overlay", WebviewUrl::App("/overlay".into()))
        .title("Parsec Recording")
        .inner_size(320.0, 120.0)
        .resizable(false)
        .decorations(false)
        .always_on_top(true)
        .visible(false)
        .focused(false)
        .skip_taskbar(true)
        .center()
        .build()?;

    Ok(())
}

fn create_settings_window(app: &tauri::AppHandle) -> tauri::Result<()> {
    if let Some(win) = app.get_webview_window("settings") {
        let _ = win.show();
        let _ = win.set_focus();
        return Ok(());
    }

    WebviewWindowBuilder::new(app, "settings", WebviewUrl::App("/settings".into()))
        .title("Parsec")
        .inner_size(800.0, 600.0)
        .min_inner_size(520.0, 400.0)
        .resizable(true)
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
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
            check_accessibility_permission,
            open_privacy_settings,
            set_dock_visible,
            get_history,
            delete_history_entry,
            clear_history,
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
            let quit_item = MenuItemBuilder::with_id("quit", "Quit Parsec").build(app)?;
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
                .tooltip("Parsec")
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

            // Register global hotkey
            hotkey::register_default_hotkey(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
