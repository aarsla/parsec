use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tauri_plugin_store::StoreExt;

const STORE_FILE: &str = "history.json";
const STORE_KEY: &str = "entries";
const MAX_ENTRIES: usize = 500;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryEntry {
    pub id: String,
    pub text: String,
    pub timestamp: i64,
    pub app_name: Option<String>,
    pub window_title: Option<String>,
    pub char_count: usize,
}

pub fn add_entry(app: &AppHandle, entry: HistoryEntry) {
    let store = match app.store(STORE_FILE) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("Failed to open history store: {e}");
            return;
        }
    };

    let mut entries: Vec<HistoryEntry> = store
        .get(STORE_KEY)
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    entries.insert(0, entry);
    entries.truncate(MAX_ENTRIES);

    store.set(STORE_KEY, serde_json::to_value(&entries).unwrap());
    let _ = app.emit("history-updated", ());
}

pub fn get_entries(app: &AppHandle) -> Vec<HistoryEntry> {
    let store = match app.store(STORE_FILE) {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };

    store
        .get(STORE_KEY)
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default()
}

pub fn delete_entry(app: &AppHandle, id: &str) {
    let store = match app.store(STORE_FILE) {
        Ok(s) => s,
        Err(_) => return,
    };

    let mut entries: Vec<HistoryEntry> = store
        .get(STORE_KEY)
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    entries.retain(|e| e.id != id);
    store.set(STORE_KEY, serde_json::to_value(&entries).unwrap());
}

pub fn clear_entries(app: &AppHandle) {
    let store = match app.store(STORE_FILE) {
        Ok(s) => s,
        Err(_) => return,
    };

    store.set(STORE_KEY, serde_json::to_value::<Vec<HistoryEntry>>(vec![]).unwrap());
}
