use tauri::{App, AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use crate::state::{AppState, Status};

const DEFAULT_HOTKEY: &str = "CmdOrCtrl+Shift+Space";

fn shortcut_handler(app: &AppHandle, _shortcut: &Shortcut, event: tauri_plugin_global_shortcut::ShortcutEvent) {
    if event.state != ShortcutState::Pressed {
        return;
    }

    let state = app.state::<AppState>();
    let current = state.status();

    match current {
        Status::Idle => {
            let _ = app.emit("recording-toggle", "start");
        }
        Status::Recording => {
            let _ = app.emit("recording-toggle", "stop");
        }
        Status::Transcribing => {}
    }
}

pub fn register_default_hotkey(app: &App) -> Result<(), Box<dyn std::error::Error>> {
    let shortcut: Shortcut = DEFAULT_HOTKEY.parse()?;
    app.global_shortcut().on_shortcut(shortcut, shortcut_handler)?;
    Ok(())
}

pub fn update_hotkey(app: &AppHandle, new_shortcut: &str) -> Result<(), Box<dyn std::error::Error>> {
    let gs = app.global_shortcut();

    // Unregister all existing shortcuts
    gs.unregister_all()?;

    // Register the new one
    let shortcut: Shortcut = new_shortcut.parse()?;
    gs.on_shortcut(shortcut, shortcut_handler)?;

    Ok(())
}