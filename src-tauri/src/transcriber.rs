use anyhow::{Context, Result};
use parakeet_rs::{ExecutionConfig, ParakeetTDT, TimestampMode, Transcriber};
#[cfg(windows)]
use parakeet_rs::ExecutionProvider;
use parking_lot::Mutex;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::Emitter;
use whisper_rs::{WhisperContext, WhisperContextParameters, FullParams, SamplingStrategy};

use crate::model_registry::{self, Engine, DEFAULT_MODEL_ID};

static PARAKEET_MODEL: Mutex<Option<ParakeetTDT>> = Mutex::new(None);
/// (model_id, WhisperContext) — we store the id to know which model is loaded.
static WHISPER_CTX: Mutex<Option<(String, WhisperContext)>> = Mutex::new(None);
static DOWNLOAD_IN_PROGRESS: AtomicBool = AtomicBool::new(false);

pub fn is_downloading() -> bool {
    DOWNLOAD_IN_PROGRESS.load(Ordering::Relaxed)
}

// --- Download / delete ---

async fn download_file(
    url: &str,
    dest: &Path,
    app: &tauri::AppHandle,
    label: &str,
    model_id: &str,
    approx_total: u64,
    cumulative_offset: u64,
) -> Result<u64> {
    use futures_util::StreamExt;
    use tokio::io::AsyncWriteExt;

    let client = reqwest::Client::new();
    let resp = client.get(url).send().await?.error_for_status()?;
    let total = resp.content_length().unwrap_or(0);

    let mut stream = resp.bytes_stream();
    let mut file = tokio::fs::File::create(dest).await?;
    let mut downloaded: u64 = 0;
    let mut last_overall_pct: u32 =
        ((cumulative_offset as f64 / approx_total as f64) * 100.0).min(99.0) as u32;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        file.write_all(&chunk).await?;
        downloaded += chunk.len() as u64;

        let progress = if total > 0 {
            (downloaded as f64 / total as f64 * 100.0) as u32
        } else {
            0
        };
        let overall_downloaded = cumulative_offset + downloaded;
        let overall_progress =
            ((overall_downloaded as f64 / approx_total as f64) * 100.0).min(99.0) as u32;

        if overall_progress != last_overall_pct {
            last_overall_pct = overall_progress;
            let _ = app.emit(
                "model-download-progress",
                serde_json::json!({
                    "file": label,
                    "modelId": model_id,
                    "progress": progress,
                    "downloaded": downloaded,
                    "total": total,
                    "overall_downloaded": overall_downloaded,
                    "overall_total": approx_total,
                    "overall_progress": overall_progress,
                }),
            );
        }
    }

    file.flush().await?;
    Ok(downloaded)
}

async fn do_ensure_model(app: &tauri::AppHandle, model_id: &str) -> Result<()> {
    let def = model_registry::find_model(model_id)
        .with_context(|| format!("Unknown model: {}", model_id))?;

    if model_registry::model_ready(model_id) {
        return Ok(());
    }

    let dir = model_registry::model_dir(model_id);
    tokio::fs::create_dir_all(&dir).await?;

    // Collect files that still need downloading
    let mut files_to_download = Vec::new();
    for file in def.files {
        let dest_name = model_registry::file_dest_name(file);
        if dir.join(dest_name).exists() {
            continue;
        }
        files_to_download.push(file);
    }

    let _ = app.emit(
        "model-download-progress",
        serde_json::json!({
            "file": "starting",
            "modelId": model_id,
            "progress": 0,
            "overall_downloaded": 0,
            "overall_total": def.approx_bytes,
            "overall_progress": 0,
        }),
    );

    let mut cumulative_offset: u64 = 0;
    for file in &files_to_download {
        let url_filename = file.url.rsplit('/').next().unwrap_or("file");
        let download_dest = dir.join(url_filename);

        let bytes_downloaded = download_file(
            file.url,
            &download_dest,
            app,
            url_filename,
            model_id,
            def.approx_bytes,
            cumulative_offset,
        )
        .await
        .with_context(|| format!("Failed to download {}", url_filename))?;

        cumulative_offset += bytes_downloaded;

        // Rename if needed
        if let Some(rename_to) = file.rename_to {
            let final_path = dir.join(rename_to);
            if download_dest != final_path && !final_path.exists() {
                tokio::fs::rename(&download_dest, &final_path).await?;
            }
        }
    }

    let _ = app.emit(
        "model-download-progress",
        serde_json::json!({
            "file": "complete",
            "modelId": model_id,
            "progress": 100,
            "overall_downloaded": cumulative_offset,
            "overall_total": def.approx_bytes,
            "overall_progress": 100,
        }),
    );

    Ok(())
}

pub async fn ensure_model(app: &tauri::AppHandle, model_id: &str) -> Result<()> {
    if model_registry::model_ready(model_id) {
        return Ok(());
    }

    if DOWNLOAD_IN_PROGRESS
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Ok(());
    }

    let result = do_ensure_model(app, model_id).await;
    DOWNLOAD_IN_PROGRESS.store(false, Ordering::SeqCst);
    result
}

pub async fn delete_model(model_id: &str) -> Result<()> {
    let def = model_registry::find_model(model_id);
    if def.is_none() {
        anyhow::bail!("Unknown model: {}", model_id);
    }
    let engine = def.unwrap().engine;

    // Unload if this model is currently loaded
    match engine {
        Engine::Parakeet => {
            let mut lock = PARAKEET_MODEL.lock();
            *lock = None;
        }
        Engine::Whisper => {
            let mut lock = WHISPER_CTX.lock();
            if let Some((ref id, _)) = *lock {
                if id == model_id {
                    *lock = None;
                }
            }
        }
    }

    let dir = model_registry::model_dir(model_id);
    if dir.exists() {
        tokio::fs::remove_dir_all(&dir).await?;
    }
    Ok(())
}

// --- Parakeet engine ---

fn execution_provider_label() -> &'static str {
    #[cfg(windows)]
    { "DirectML" }
    #[cfg(not(windows))]
    { "CPU" }
}

fn default_execution_config() -> Option<ExecutionConfig> {
    #[cfg(windows)]
    {
        Some(ExecutionConfig::new().with_execution_provider(ExecutionProvider::DirectML))
    }
    #[cfg(not(windows))]
    {
        None
    }
}

fn load_parakeet() -> Result<()> {
    let mut lock = PARAKEET_MODEL.lock();
    if lock.is_some() {
        return Ok(());
    }

    let dir = model_registry::model_dir(DEFAULT_MODEL_ID);
    let (model, provider) = match default_execution_config() {
        Some(config) => {
            let label = execution_provider_label();
            match ParakeetTDT::from_pretrained(&dir, Some(config)) {
                Ok(m) => (m, label),
                Err(e) => {
                    eprintln!("[audioshift] {} failed: {}, falling back to CPU", label, e);
                    let m = ParakeetTDT::from_pretrained(&dir, None)
                        .context("Failed to load Parakeet TDT model")?;
                    (m, "CPU")
                }
            }
        }
        None => {
            let m = ParakeetTDT::from_pretrained(&dir, None)
                .context("Failed to load Parakeet TDT model")?;
            (m, "CPU")
        }
    };
    eprintln!("[audioshift] Model loaded with {} execution provider", provider);
    *lock = Some(model);
    Ok(())
}

fn transcribe_parakeet(samples: Vec<f32>) -> Result<String> {
    load_parakeet()?;
    let mut lock = PARAKEET_MODEL.lock();
    let model = lock.as_mut().context("Parakeet model not loaded")?;
    let result = model
        .transcribe_samples(samples, 16000, 1, Some(TimestampMode::Sentences))
        .map_err(|e| anyhow::anyhow!("{}", e))?;
    Ok(result.text)
}

// --- Whisper engine ---

fn load_whisper(model_id: &str) -> Result<()> {
    let mut lock = WHISPER_CTX.lock();
    if let Some((ref id, _)) = *lock {
        if id == model_id {
            return Ok(());
        }
    }

    let dir = model_registry::model_dir(model_id);
    let model_path = dir.join("model.bin");
    anyhow::ensure!(model_path.exists(), "Whisper model file not found: {:?}", model_path);

    let mut params = WhisperContextParameters::default();
    params.use_gpu(true);
    params.flash_attn(true);

    let ctx = WhisperContext::new_with_params(
        model_path.to_str().context("Invalid model path")?,
        params,
    )
    .map_err(|e| anyhow::anyhow!("Failed to load Whisper model: {}", e))?;

    eprintln!("[audioshift] Whisper model loaded: {}", model_id);
    *lock = Some((model_id.to_string(), ctx));
    Ok(())
}

fn transcribe_whisper(
    samples: Vec<f32>,
    model_id: String,
    language: Option<String>,
    translate: bool,
) -> Result<String> {
    load_whisper(&model_id)?;

    let lock = WHISPER_CTX.lock();
    let (_, ctx) = lock.as_ref().context("Whisper context not loaded")?;

    let mut state = ctx.create_state()
        .map_err(|e| anyhow::anyhow!("Failed to create Whisper state: {}", e))?;

    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    params.set_n_threads(num_cpus::get().min(8) as i32);
    params.set_language(language.as_deref());
    params.set_translate(translate);
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);
    params.set_suppress_blank(true);
    params.set_suppress_nst(true);

    state.full(params, &samples)
        .map_err(|e| anyhow::anyhow!("Whisper transcription failed: {}", e))?;

    let num_segments = state.full_n_segments();
    let mut text = String::new();
    for i in 0..num_segments {
        if let Some(segment) = state.get_segment(i) {
            if let Ok(s) = segment.to_str() {
                text.push_str(s);
            }
        }
    }

    Ok(text.trim().to_string())
}

// --- Preload ---

/// Preload a model into memory in the background so the first transcription is instant.
/// Safe to call even if the model isn't downloaded yet (just returns Ok).
pub fn preload_model(model_id: &str) -> Result<()> {
    let def = match model_registry::find_model(model_id) {
        Some(d) => d,
        None => return Ok(()),
    };

    if !model_registry::model_ready(model_id) {
        return Ok(());
    }

    match def.engine {
        Engine::Parakeet => load_parakeet()?,
        Engine::Whisper => load_whisper(model_id)?,
    }

    eprintln!("[audioshift] Model preloaded: {}", model_id);
    Ok(())
}

// --- Public transcribe entry point ---

pub async fn transcribe_from_samples(
    app: &tauri::AppHandle,
    samples: Vec<f32>,
    model_id: &str,
    language: Option<String>,
    translate: bool,
) -> Result<String> {
    ensure_model(app, model_id).await?;

    let _ = app.emit("status-changed", "transcribing");

    let def = model_registry::find_model(model_id)
        .with_context(|| format!("Unknown model: {}", model_id))?;

    let result = match def.engine {
        Engine::Parakeet => {
            tokio::task::spawn_blocking(move || transcribe_parakeet(samples)).await??
        }
        Engine::Whisper => {
            let mid = model_id.to_string();
            tokio::task::spawn_blocking(move || transcribe_whisper(samples, mid, language, translate)).await??
        }
    };

    Ok(result)
}
