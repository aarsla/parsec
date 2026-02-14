use parking_lot::Mutex;
use std::fmt;
use std::sync::Arc;
use tauri::menu::MenuItem;
use tauri::tray::TrayIcon;
use tokio::sync::watch;

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Status {
    Idle,
    Recording,
    Transcribing,
}

#[derive(Clone, PartialEq)]
pub enum TrayAnimation {
    None,
    Preloading,
    Recording { amplitude: f32 },
}

impl fmt::Display for Status {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Status::Idle => write!(f, "idle"),
            Status::Recording => write!(f, "recording"),
            Status::Transcribing => write!(f, "transcribing"),
        }
    }
}

#[allow(dead_code)]
pub struct AppState {
    status: Mutex<Status>,
    pub audio_buffer: Arc<Mutex<Vec<f32>>>,
    hotkey: Mutex<String>,
    tray: Mutex<Option<TrayIcon>>,
    tray_status_item: Mutex<Option<MenuItem<tauri::Wry>>>,
    tray_updates_item: Mutex<Option<MenuItem<tauri::Wry>>>,
    animation_tx: watch::Sender<TrayAnimation>,
    animation_rx: Mutex<Option<watch::Receiver<TrayAnimation>>>,
}

#[allow(dead_code)]
impl AppState {
    pub fn new() -> Self {
        let (animation_tx, animation_rx) = watch::channel(TrayAnimation::None);
        Self {
            status: Mutex::new(Status::Idle),
            audio_buffer: Arc::new(Mutex::new(Vec::new())),
            hotkey: Mutex::new(if cfg!(target_os = "macos") {
                "Alt+Space"
            } else {
                "Ctrl+Shift+Space"
            }.to_string()),
            tray: Mutex::new(None),
            tray_status_item: Mutex::new(None),
            tray_updates_item: Mutex::new(None),
            animation_tx,
            animation_rx: Mutex::new(Some(animation_rx)),
        }
    }

    pub fn status(&self) -> Status {
        *self.status.lock()
    }

    pub fn set_status(&self, status: Status) {
        *self.status.lock() = status;
    }

    pub fn hotkey(&self) -> String {
        self.hotkey.lock().clone()
    }

    pub fn set_hotkey(&self, hotkey: String) {
        *self.hotkey.lock() = hotkey;
    }

    pub fn set_tray(&self, tray: TrayIcon, status_item: MenuItem<tauri::Wry>) {
        *self.tray.lock() = Some(tray);
        *self.tray_status_item.lock() = Some(status_item);
    }

    pub fn tray(&self) -> Option<TrayIcon> {
        self.tray.lock().clone()
    }

    pub fn tray_status_item(&self) -> Option<MenuItem<tauri::Wry>> {
        self.tray_status_item.lock().clone()
    }

    pub fn set_tray_updates_item(&self, item: MenuItem<tauri::Wry>) {
        *self.tray_updates_item.lock() = Some(item);
    }

    pub fn tray_updates_item(&self) -> Option<MenuItem<tauri::Wry>> {
        self.tray_updates_item.lock().clone()
    }

    pub fn set_animation(&self, anim: TrayAnimation) {
        let _ = self.animation_tx.send(anim);
    }

    pub fn take_animation_rx(&self) -> Option<watch::Receiver<TrayAnimation>> {
        self.animation_rx.lock().take()
    }
}
