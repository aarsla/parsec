use crate::commands;
use crate::model_registry;
use crate::state::{AppState, Status};
use crate::windows;
#[cfg(feature = "updater")]
use tauri::Emitter;
use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
    Listener, Manager,
};
use tauri_plugin_store::StoreExt;

const TRAY_ICON_NORMAL: &[u8] = include_bytes!("../icons/tray-icon.png");
const TRAY_ICON_RECORDING: &[u8] = include_bytes!("../icons/tray-icon-recording.png");

pub fn status_menu_text(status: Status, hotkey: &str) -> String {
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
        .replace("Alt", "\u{2325}")
        .replace("Shift", "\u{21E7}")
        .replace("Ctrl", "\u{2303}")
        .replace("Space", "Space")
        .replace("+", "")
}

pub fn update_tray_for_status(app: &tauri::AppHandle, status: Status) {
    let state = app.state::<AppState>();

    // Update icon
    if let Some(tray) = state.tray() {
        let icon_bytes = match status {
            Status::Recording => TRAY_ICON_RECORDING,
            _ => TRAY_ICON_NORMAL,
        };
        if let Ok(icon) = Image::from_bytes(icon_bytes) {
            let _ = tray.set_icon(Some(icon));
            let _ = tray.set_icon_as_template(true);
        }
    }

    // Update status menu item text
    if let Some(status_item) = state.tray_status_item() {
        let text = status_menu_text(status, &state.hotkey());
        let _ = status_item.set_text(text);
    }
}

pub fn onboarding_needed(app: &tauri::AppHandle) -> bool {
    let store = app.store("settings.json").ok();
    let completed = store
        .as_ref()
        .and_then(|s| s.get("onboardingCompleted"))
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let model = model_registry::any_model_ready();
    let mic = commands::check_microphone_permission();
    let a11y = commands::check_accessibility_permission();
    let needed = !completed;
    eprintln!(
        "[audioshift] onboarding_needed: completed={}, model={}, mic={}, a11y={} → {}",
        completed, model, mic, a11y, needed
    );
    needed
}

pub fn build_tray(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let state = app.state::<AppState>();
    let status_text = status_menu_text(Status::Idle, &state.hotkey());

    let status_item = MenuItemBuilder::with_id("status", &status_text)
        .enabled(false)
        .build(app)?;
    let settings_item =
        MenuItemBuilder::with_id("settings", "Settings").build(app)?;
    let quit_item = MenuItemBuilder::with_id("quit", "Quit AudioShift").build(app)?;

    #[allow(unused_mut)]
    let mut menu_builder = MenuBuilder::new(app)
        .item(&status_item)
        .separator()
        .item(&settings_item);

    #[cfg(feature = "updater")]
    let updates_item =
        MenuItemBuilder::with_id("updates", "Check for Updates...").build(app)?;
    #[cfg(feature = "updater")]
    {
        menu_builder = menu_builder.item(&updates_item);
    }

    let menu = menu_builder
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
                let _ = windows::create_settings_window(app);
            }
            #[cfg(feature = "updater")]
            "updates" => {
                // Store pending section so fresh windows pick it up on mount
                if let Ok(store) = app.store("settings.json") {
                    let _ = store.set("pendingSection", serde_json::json!("updates"));
                }
                let _ = windows::create_settings_window(app);
                app.emit("navigate-section", "updates").ok();
                let handle = app.clone();
                tauri::async_runtime::spawn(async move {
                    crate::updater::do_update_check(&handle, false).await;
                });
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .build(app)?;

    // Store tray handle for dynamic updates
    app.state::<AppState>().set_tray(tray, status_item);
    #[cfg(feature = "updater")]
    app.state::<AppState>().set_tray_updates_item(updates_item);

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

    Ok(())
}
