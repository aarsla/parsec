use crate::commands;
use crate::model_registry;
use crate::state::{AppState, Status, TrayAnimation};
use crate::tray_icons;
use crate::windows;
use std::time::Duration;
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

    match status {
        Status::Recording => {
            // Animation loop takes over icon rendering
            state.set_animation(TrayAnimation::Recording { amplitude: 0.0 });
        }
        _ => {
            // Stop any animation, restore static icon
            state.set_animation(TrayAnimation::None);
            if let Some(tray) = state.tray() {
                if let Ok(icon) = Image::from_bytes(TRAY_ICON_NORMAL) {
                    let _ = tray.set_icon(Some(icon));
                    let _ = tray.set_icon_as_template(true);
                }
            }
        }
    }

    // Update status menu item text
    if let Some(status_item) = state.tray_status_item() {
        let text = status_menu_text(status, &state.hotkey());
        let _ = status_item.set_text(text);
    }
}

fn set_tray_icon_rgba(app: &tauri::AppHandle, rgba: Vec<u8>) {
    let state = app.state::<AppState>();
    if let Some(tray) = state.tray() {
        let icon = Image::new_owned(rgba, tray_icons::ICON_SIZE, tray_icons::ICON_SIZE);
        let _ = tray.set_icon(Some(icon));
        let _ = tray.set_icon_as_template(true);
    }
}

fn start_animation_loop(app: &tauri::AppHandle) {
    let state = app.state::<AppState>();
    let mut rx = match state.take_animation_rx() {
        Some(rx) => rx,
        None => return,
    };
    let handle = app.clone();

    tauri::async_runtime::spawn(async move {
        let mut preload_index: usize = 0;
        let mut smoothed_amp: f32 = 0.0;
        let mut tick: u32 = 0;

        loop {
            let anim = rx.borrow_and_update().clone();

            match anim {
                TrayAnimation::None => {
                    smoothed_amp = 0.0;
                    tick = 0;
                    if rx.changed().await.is_err() {
                        break;
                    }
                }
                TrayAnimation::Preloading => {
                    let rgba = tray_icons::preload_frame(preload_index);
                    set_tray_icon_rgba(&handle, rgba);
                    preload_index += 1;

                    tokio::select! {
                        _ = tokio::time::sleep(Duration::from_millis(200)) => {}
                        result = rx.changed() => {
                            if result.is_err() { break; }
                            preload_index = 0;
                        }
                    }
                }
                TrayAnimation::Recording { amplitude } => {
                    // Scale raw amplitude (typically 0.0–0.1 for speech) to visual range
                    let scaled = (amplitude * 8.0).sqrt().clamp(0.0, 1.0);
                    // Smooth: fast attack, slow decay for natural VU meter feel
                    if scaled > smoothed_amp {
                        smoothed_amp += (scaled - smoothed_amp) * 0.5;
                    } else {
                        smoothed_amp += (scaled - smoothed_amp) * 0.15;
                    }

                    let rgba = tray_icons::recording_frame(tick, smoothed_amp);
                    set_tray_icon_rgba(&handle, rgba);
                    tick = tick.wrapping_add(1);

                    tokio::select! {
                        _ = tokio::time::sleep(Duration::from_millis(100)) => {}
                        result = rx.changed() => {
                            if result.is_err() { break; }
                        }
                    }
                }
            }
        }
    });
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
                    let _ = store.set("pendingSection", serde_json::json!("about"));
                }
                let _ = windows::create_settings_window(app);
                app.emit("navigate-section", "about").ok();
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

    // Listen for model preload start → animate tray
    let handle = app.handle().clone();
    app.listen("model-preload-start", move |_event| {
        let state = handle.state::<AppState>();
        state.set_animation(TrayAnimation::Preloading);
        if let Some(status_item) = state.tray_status_item() {
            let _ = status_item.set_text("Loading model...");
        }
    });

    // Listen for model preload done → stop animation, restore static icon
    let handle = app.handle().clone();
    app.listen("model-preload-done", move |_event| {
        let state = handle.state::<AppState>();
        let status = state.status();
        // Only restore idle icon if not recording (recording has its own animation)
        if status != Status::Recording {
            state.set_animation(TrayAnimation::None);
            if let Some(tray) = state.tray() {
                if let Ok(icon) = Image::from_bytes(TRAY_ICON_NORMAL) {
                    let _ = tray.set_icon(Some(icon));
                    let _ = tray.set_icon_as_template(true);
                }
            }
        }
        if let Some(status_item) = state.tray_status_item() {
            let text = status_menu_text(status, &state.hotkey());
            let _ = status_item.set_text(text);
        }
    });

    // Listen for audio amplitude → update recording animation
    let handle = app.handle().clone();
    app.listen("audio-amplitude", move |event| {
        let state = handle.state::<AppState>();
        if state.status() == Status::Recording {
            if let Ok(amplitude) = event.payload().parse::<f32>() {
                state.set_animation(TrayAnimation::Recording { amplitude });
            }
        }
    });

    // Start the animation loop
    start_animation_loop(app.handle());

    Ok(())
}
