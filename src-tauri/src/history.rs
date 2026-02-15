use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use crate::file_storage;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryEntry {
    pub id: String,
    pub text: String,
    pub timestamp: i64,
    pub app_name: Option<String>,
    pub window_title: Option<String>,
    pub char_count: usize,
    pub dir_path: Option<String>,
    pub duration_ms: u64,
    pub processing_time_ms: u64,
    pub model_id: String,
    pub language: Option<String>,
    pub translate: bool,
    pub app_version: String,
}

pub struct RecordingInfo {
    pub samples: Vec<f32>,
    pub text: String,
    pub app_name: Option<String>,
    pub window_title: Option<String>,
    pub duration_ms: u64,
    pub processing_time_ms: u64,
    pub model_id: String,
    pub language: Option<String>,
    pub translate: bool,
}

pub fn add_entry(app: &AppHandle, info: RecordingInfo) {
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    let id = timestamp.as_secs().to_string();
    let char_count = info.text.chars().count();

    let meta = file_storage::RecordingMeta {
        id: id.clone(),
        text: info.text,
        timestamp: timestamp.as_millis() as i64,
        app_name: info.app_name,
        window_title: info.window_title,
        char_count,
        duration_ms: info.duration_ms,
        processing_time_ms: info.processing_time_ms,
        model_id: info.model_id,
        language: info.language,
        translate: info.translate,
        app_version: env!("CARGO_PKG_VERSION").to_string(),
    };

    match file_storage::save_recording(&info.samples, &meta) {
        Ok(_dir) => {}
        Err(e) => {
            eprintln!("[audioshift] Failed to save recording: {e}");
        }
    }

    let _ = app.emit("history-updated", ());
}

pub fn get_entries(_app: &AppHandle) -> Result<Vec<HistoryEntry>, String> {
    let base = file_storage::recordings_dir();
    let metas = file_storage::load_all_recordings().map_err(|e| e.to_string())?;
    let entries = metas
        .into_iter()
        .map(|meta| {
            let dir = base.join(&meta.id);
            HistoryEntry {
                id: meta.id,
                text: meta.text,
                timestamp: meta.timestamp,
                app_name: meta.app_name,
                window_title: meta.window_title,
                char_count: meta.char_count,
                dir_path: Some(dir.to_string_lossy().to_string()),
                duration_ms: meta.duration_ms,
                processing_time_ms: meta.processing_time_ms,
                model_id: meta.model_id,
                language: meta.language,
                translate: meta.translate,
                app_version: meta.app_version,
            }
        })
        .collect();
    Ok(entries)
}

pub fn delete_entry(app: &AppHandle, id: &str) {
    if let Err(e) = file_storage::delete_recording(id) {
        eprintln!("[audioshift] Failed to delete recording {id}: {e}");
    }
    let _ = app.emit("history-updated", ());
}

pub fn clear_entries(app: &AppHandle) {
    if let Err(e) = file_storage::clear_recordings() {
        eprintln!("[audioshift] Failed to clear recordings: {e}");
    }
    let _ = app.emit("history-updated", ());
}
