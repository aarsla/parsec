use anyhow::{Context, Result};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use tauri::{Emitter, Manager};

use crate::audio_converter;
use crate::model_registry;
use crate::state::AppState;
use crate::transcriber;
use tauri_plugin_store::StoreExt;

/// Processing speed: microseconds of wall-clock time per second of audio.
/// Default 1_000_000 = 1:1 ratio. Updated after each transcription.
static SPEED_RATIO_USECS: AtomicU64 = AtomicU64::new(1_000_000);

const MEDIA_EXTENSIONS: &[&str] = &[
    "mp3", "m4a", "ogg", "wav", "flac", "aac", "wma", "opus",
    "mp4", "m4v", "mkv", "webm", "mov",
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileTranscriptionStatus {
    pub status: &'static str, // "idle" | "converting" | "transcribing" | "completed" | "error"
    pub file_name: Option<String>,
    pub source_path: Option<String>,
    pub progress: u32,          // 0-100
    pub elapsed_secs: u64,
    pub estimated_secs: u64,
    pub duration_secs: Option<f64>, // audio duration
    pub decode_secs: Option<f64>,   // time spent decoding/resampling
    pub result_text: Option<String>,
    pub output_path: Option<String>,
    pub error: Option<String>,
}

impl Default for FileTranscriptionStatus {
    fn default() -> Self {
        Self {
            status: "idle",
            file_name: None,
            source_path: None,
            progress: 0,
            elapsed_secs: 0,
            estimated_secs: 0,
            duration_secs: None,
            decode_secs: None,
            result_text: None,
            output_path: None,
            error: None,
        }
    }
}

pub fn is_media_file(path: &str) -> bool {
    Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| MEDIA_EXTENSIONS.contains(&e.to_lowercase().as_str()))
        .unwrap_or(false)
}

fn output_dir() -> PathBuf {
    dirs::document_dir()
        .unwrap_or_else(|| dirs::home_dir().unwrap_or_else(|| PathBuf::from(".")))
        .join("AudioShift Transcriptions")
}

fn unique_output_path(base_name: &str) -> PathBuf {
    let dir = output_dir();
    let _ = std::fs::create_dir_all(&dir);

    let stem = Path::new(base_name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("transcription");

    let candidate = dir.join(format!("{}.txt", stem));
    if !candidate.exists() {
        return candidate;
    }

    for i in 2..=999 {
        let candidate = dir.join(format!("{} ({}).txt", stem, i));
        if !candidate.exists() {
            return candidate;
        }
    }

    dir.join(format!("{} ({}).txt", stem, uuid::Uuid::new_v4()))
}

fn emit_status(app: &tauri::AppHandle, status: &FileTranscriptionStatus) {
    let _ = app.emit("file-transcription-status", status);
}

pub fn cancel(app: &tauri::AppHandle) {
    let state = app.state::<AppState>();
    state.file_cancel_requested.store(true, Ordering::SeqCst);
}

pub fn is_processing(app: &tauri::AppHandle) -> bool {
    let state = app.state::<AppState>();
    state.file_processing.load(Ordering::Relaxed)
}

pub async fn transcribe_file(app: &tauri::AppHandle, source_path: &str) -> Result<()> {
    let path = Path::new(source_path);
    anyhow::ensure!(path.exists(), "File not found");
    anyhow::ensure!(is_media_file(source_path), "Not a supported media file");

    let state = app.state::<AppState>();

    // Prevent concurrent processing
    if state.file_processing.swap(true, Ordering::SeqCst) {
        anyhow::bail!("Already processing a file");
    }
    state.file_cancel_requested.store(false, Ordering::SeqCst);

    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    // Emit converting status
    emit_status(app, &FileTranscriptionStatus {
        status: "converting",
        file_name: Some(file_name.clone()),
        source_path: Some(source_path.to_string()),
        ..Default::default()
    });

    // Decode to samples
    let decode_start = std::time::Instant::now();
    let src = PathBuf::from(source_path);
    let (samples, duration_secs) =
        tokio::task::spawn_blocking(move || audio_converter::decode_to_samples(&src))
            .await
            .context("Decode task panicked")??;
    let decode_elapsed = decode_start.elapsed().as_secs_f64();
    eprintln!("[audioshift] Decode: {:.2}s (audio: {:.0}s, {} samples)", decode_elapsed, duration_secs, samples.len());

    // Check cancellation
    if state.file_cancel_requested.load(Ordering::SeqCst) {
        state.file_processing.store(false, Ordering::SeqCst);
        emit_status(app, &FileTranscriptionStatus::default());
        return Ok(());
    }

    // Estimate total processing time
    let speed_ratio = SPEED_RATIO_USECS.load(Ordering::Relaxed) as f64 / 1_000_000.0;
    let estimated_secs = (duration_secs * speed_ratio).max(1.0);

    // Emit transcribing status
    emit_status(app, &FileTranscriptionStatus {
        status: "transcribing",
        file_name: Some(file_name.clone()),
        source_path: Some(source_path.to_string()),
        duration_secs: Some(duration_secs),
        decode_secs: Some(decode_elapsed),
        estimated_secs: estimated_secs as u64,
        ..Default::default()
    });

    // Spawn progress timer
    let progress_stop = std::sync::Arc::new(AtomicBool::new(false));
    let stop_clone = progress_stop.clone();
    let app_progress = app.clone();
    let file_name_clone = file_name.clone();
    let source_path_owned = source_path.to_string();
    let progress_task = tokio::spawn(async move {
        let start = std::time::Instant::now();
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            if stop_clone.load(Ordering::Relaxed) {
                break;
            }
            let elapsed = start.elapsed().as_secs_f64();
            let pct = ((elapsed / estimated_secs) * 100.0).min(95.0) as u32;
            emit_status(&app_progress, &FileTranscriptionStatus {
                status: "transcribing",
                file_name: Some(file_name_clone.clone()),
                source_path: Some(source_path_owned.clone()),
                progress: pct,
                elapsed_secs: elapsed as u64,
                estimated_secs: estimated_secs as u64,
                duration_secs: Some(duration_secs),
                decode_secs: Some(decode_elapsed),
                ..Default::default()
            });
        }
    });

    // Read file model from settings
    let file_model = app
        .store("settings.json")
        .ok()
        .and_then(|s| s.get("fileModel"))
        .and_then(|v| v.as_str().map(String::from))
        .unwrap_or_else(|| model_registry::DEFAULT_MODEL_ID.to_string());

    // Transcribe
    let transcribe_start = std::time::Instant::now();
    let result = transcriber::transcribe_from_samples(app, samples, &file_model).await;
    let transcribe_elapsed = transcribe_start.elapsed().as_secs_f64();
    eprintln!("[audioshift] Transcribe: {:.2}s", transcribe_elapsed);

    // Stop progress timer
    progress_stop.store(true, Ordering::Relaxed);
    let _ = progress_task.await;

    // Update speed ratio
    if duration_secs > 0.0 {
        let new_ratio = transcribe_elapsed / duration_secs;
        let old_ratio = SPEED_RATIO_USECS.load(Ordering::Relaxed) as f64 / 1_000_000.0;
        let blended = if old_ratio == 1.0 { new_ratio } else { old_ratio * 0.3 + new_ratio * 0.7 };
        SPEED_RATIO_USECS.store((blended * 1_000_000.0) as u64, Ordering::Relaxed);
    }

    // Check cancellation
    if state.file_cancel_requested.load(Ordering::SeqCst) {
        state.file_processing.store(false, Ordering::SeqCst);
        emit_status(app, &FileTranscriptionStatus::default());
        return Ok(());
    }

    match result {
        Ok(text) => {
            // Auto-save .txt
            let out_path = unique_output_path(&file_name);
            std::fs::write(&out_path, &text).context("Failed to write transcription file")?;
            let out_str = out_path.to_string_lossy().to_string();

            emit_status(app, &FileTranscriptionStatus {
                status: "completed",
                file_name: Some(file_name),
                source_path: Some(source_path.to_string()),
                progress: 100,
                elapsed_secs: transcribe_elapsed as u64,
                estimated_secs: transcribe_elapsed as u64,
                duration_secs: Some(duration_secs),
                decode_secs: Some(decode_elapsed),
                result_text: Some(text),
                output_path: Some(out_str),
                error: None,
            });
        }
        Err(e) => {
            emit_status(app, &FileTranscriptionStatus {
                status: "error",
                file_name: Some(file_name),
                source_path: Some(source_path.to_string()),
                error: Some(e.to_string()),
                ..Default::default()
            });
        }
    }

    state.file_processing.store(false, Ordering::SeqCst);
    state.file_cancel_requested.store(false, Ordering::SeqCst);
    let _ = app.emit("status-changed", "idle");

    Ok(())
}
