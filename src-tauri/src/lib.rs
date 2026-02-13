mod commands;
mod escape_monitor;
mod frontmost;
mod history;
mod hotkey;
mod login_item;
mod model_registry;
mod paster;
mod plugins;
mod recorder;
mod state;
mod transcriber;
mod tray;
mod updater;
mod windows;

use state::AppState;
use tauri::Manager;
use tauri_plugin_store::StoreExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_process::init());

    #[cfg(not(feature = "mas"))]
    {
        builder = builder.plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::AppleScript,
            None,
        ));
    }

    #[cfg(feature = "updater")]
    {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            commands::get_input_devices,
            commands::start_monitor,
            commands::stop_monitor,
            commands::get_app_status,
            commands::start_recording,
            commands::stop_recording,
            commands::cancel_recording,
            commands::get_current_hotkey,
            commands::set_hotkey,
            commands::check_microphone_permission,
            commands::request_microphone_permission,
            commands::check_accessibility_permission,
            commands::request_accessibility_permission,
            commands::open_privacy_settings,
            commands::set_dock_visible,
            commands::get_work_area_at_cursor,
            commands::get_history,
            commands::delete_history_entry,
            commands::clear_history,
            commands::get_all_models_status,
            commands::download_model,
            commands::delete_model,
            commands::check_onboarding_needed,
            commands::complete_onboarding,
            commands::show_onboarding,
            commands::get_live_model,
            commands::set_live_model,
            commands::get_transcription_language,
            commands::set_transcription_language,
            commands::get_translate_to_english,
            commands::set_translate_to_english,
            commands::is_download_in_progress,
            commands::restart_app,
            commands::get_build_variant,
            updater::check_for_updates,
            updater::install_update,
            plugins::mac_rounded_corners::enable_rounded_corners,
            plugins::mac_rounded_corners::enable_modern_window_style,
            plugins::mac_rounded_corners::reposition_traffic_lights,
            login_item::mas_login_item_is_enabled,
            login_item::mas_login_item_enable,
            login_item::mas_login_item_disable,
        ])
        .setup(|app| {
            // Create overlay window (hidden by default)
            windows::create_overlay_window(&app.handle())?;

            // Build tray menu and listeners
            tray::build_tray(app)?;

            // Check if onboarding is needed
            if tray::onboarding_needed(&app.handle()) {
                eprintln!("[audioshift] Opening onboarding window...");
                match windows::create_onboarding_window(&app.handle()) {
                    Ok(()) => eprintln!("[audioshift] Onboarding window created"),
                    Err(e) => eprintln!("[audioshift] Onboarding window FAILED: {}", e),
                }
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

            // Preload AI model in background for faster first transcription
            {
                let live_model = app
                    .store("settings.json")
                    .ok()
                    .and_then(|s| s.get("liveModel"))
                    .and_then(|v| v.as_str().map(String::from))
                    .unwrap_or_else(|| model_registry::DEFAULT_MODEL_ID.to_string());
                tauri::async_runtime::spawn(async move {
                    tokio::task::spawn_blocking(move || {
                        if let Err(e) = transcriber::preload_model(&live_model) {
                            eprintln!("[audioshift] Model preload failed: {}", e);
                        }
                    }).await.ok();
                });
            }

            // Periodic update check (hourly, quiet) — direct builds only
            #[cfg(feature = "updater")]
            {
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(std::time::Duration::from_secs(60)).await;
                    loop {
                        let auto_update = handle
                            .store("settings.json")
                            .ok()
                            .and_then(|s| s.get("autoUpdate"))
                            .and_then(|v| v.as_bool())
                            .unwrap_or(true);

                        if auto_update {
                            updater::do_update_check(&handle, true).await;
                        }

                        tokio::time::sleep(std::time::Duration::from_secs(3600)).await;
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
