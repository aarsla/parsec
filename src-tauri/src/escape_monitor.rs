use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

use crate::state::{AppState, Status};

#[cfg(target_os = "macos")]
extern "C" {
    fn CGEventSourceKeyState(stateID: i32, key: u16) -> bool;
}

#[cfg(target_os = "macos")]
const ESCAPE_KEYCODE: u16 = 0x35;
// CGEventSourceStateID::CombinedSessionState
#[cfg(target_os = "macos")]
const COMBINED_SESSION_STATE: i32 = 0;

static MONITOR_ACTIVE: AtomicBool = AtomicBool::new(false);

/// Start monitoring for Escape key press (call when recording starts).
pub fn start(app: &AppHandle) {
    if MONITOR_ACTIVE.swap(true, Ordering::SeqCst) {
        return; // Already running
    }

    let app = app.clone();
    thread::spawn(move || {
        while MONITOR_ACTIVE.load(Ordering::SeqCst) {
            let state = app.state::<AppState>();
            if state.status() != Status::Recording {
                break;
            }

            #[cfg(target_os = "macos")]
            {
                let pressed = unsafe { CGEventSourceKeyState(COMBINED_SESSION_STATE, ESCAPE_KEYCODE) };
                if pressed {
                    let _ = app.emit("recording-toggle", "cancel");
                    break;
                }
            }

            thread::sleep(Duration::from_millis(50));
        }
        MONITOR_ACTIVE.store(false, Ordering::Relaxed);
    });
}

/// Stop the escape monitor (call when recording stops/cancels).
pub fn stop() {
    MONITOR_ACTIVE.store(false, Ordering::Relaxed);
}
