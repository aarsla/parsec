#[cfg(feature = "updater")]
use crate::state::{AppState, Status};
#[cfg(feature = "updater")]
use crate::tray::status_menu_text;
#[cfg(feature = "updater")]
use tauri::{Emitter, Manager};

#[cfg(feature = "updater")]
#[derive(Clone, serde::Serialize)]
pub struct UpdateStatusPayload {
    status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    body: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[cfg(feature = "updater")]
pub async fn do_update_check(app: &tauri::AppHandle, quiet: bool) {
    use tauri_plugin_updater::UpdaterExt;

    if !quiet {
        let _ = app.emit("update-status", UpdateStatusPayload {
            status: "checking".into(),
            version: None, body: None, error: None,
        });
    }

    let updater = match app.updater() {
        Ok(u) => u,
        Err(e) => {
            if !quiet {
                let _ = app.emit("update-status", UpdateStatusPayload {
                    status: "error".into(),
                    version: None, body: None,
                    error: Some(e.to_string()),
                });
            }
            return;
        }
    };

    match updater.check().await {
        Ok(Some(update)) => {
            let state = app.state::<AppState>();
            if let Some(item) = state.tray_updates_item() {
                let _ = item.set_text(format!("Update Available (v{})", update.version));
            }
            let _ = app.emit("update-status", UpdateStatusPayload {
                status: "available".into(),
                version: Some(update.version),
                body: update.body,
                error: None,
            });
        }
        Ok(None) => {
            if !quiet {
                let state = app.state::<AppState>();
                if let Some(item) = state.tray_updates_item() {
                    let _ = item.set_text("Check for Updates...");
                }
                let _ = app.emit("update-status", UpdateStatusPayload {
                    status: "up-to-date".into(),
                    version: None, body: None, error: None,
                });
            }
        }
        Err(e) => {
            if !quiet {
                let msg = e.to_string();
                let _ = app.emit("update-status", UpdateStatusPayload {
                    status: "error".into(),
                    version: None, body: None,
                    error: Some(if msg.contains("404") || msg.contains("Not Found") {
                        "No releases published yet.".into()
                    } else {
                        msg
                    }),
                });
            }
        }
    }
}

#[cfg(feature = "updater")]
#[tauri::command]
pub async fn check_for_updates(app: tauri::AppHandle) {
    do_update_check(&app, false).await;
}

#[cfg(not(feature = "updater"))]
#[tauri::command]
pub async fn check_for_updates(_app: tauri::AppHandle) {}

#[cfg(feature = "updater")]
async fn do_install(app: &tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_updater::UpdaterExt;

    let state = app.state::<AppState>();
    if let Some(status_item) = state.tray_status_item() {
        let _ = status_item.set_text("Downloading update...");
    }

    let updater = app.updater().map_err(|e| e.to_string())?;
    let update = updater.check().await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "No update available".to_string())?;

    let app_progress = app.clone();
    let mut downloaded: u64 = 0;
    let mut last_pct: u64 = 101;

    update.download_and_install(
        move |chunk_length, content_length| {
            downloaded += chunk_length as u64;
            let _ = app_progress.emit("update-download-progress", serde_json::json!({
                "downloaded": downloaded,
                "total": content_length,
            }));
            if let Some(total) = content_length {
                if total > 0 {
                    let pct = (downloaded * 100) / total;
                    if pct != last_pct {
                        last_pct = pct;
                        let state = app_progress.state::<AppState>();
                        if let Some(status_item) = state.tray_status_item() {
                            let _ = status_item.set_text(format!("Updating... {}%", pct));
                        }
                    }
                }
            }
        },
        || {},
    ).await.map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg(feature = "updater")]
#[tauri::command]
pub async fn install_update(app: tauri::AppHandle) -> Result<(), String> {
    let _ = app.emit("update-status", UpdateStatusPayload {
        status: "downloading".into(),
        version: None, body: None, error: None,
    });

    let result = do_install(&app).await;
    let state = app.state::<AppState>();

    match result {
        Ok(()) => {
            if let Some(status_item) = state.tray_status_item() {
                let _ = status_item.set_text("Update ready \u{2014} restart to apply");
            }
            let _ = app.emit("update-status", UpdateStatusPayload {
                status: "restart-pending".into(),
                version: None, body: None, error: None,
            });
            Ok(())
        }
        Err(e) => {
            // Restore tray on any failure
            if let Some(status_item) = state.tray_status_item() {
                let hotkey = state.hotkey();
                let _ = status_item.set_text(status_menu_text(Status::Idle, &hotkey));
            }
            Err(e)
        }
    }
}

#[cfg(not(feature = "updater"))]
#[tauri::command]
pub async fn install_update(_app: tauri::AppHandle) -> Result<(), String> {
    Ok(())
}
