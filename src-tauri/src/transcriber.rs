use anyhow::{Context, Result};
use parakeet_rs::{ExecutionConfig, ParakeetTDT, TimestampMode, Transcriber};
#[cfg(windows)]
use parakeet_rs::ExecutionProvider;
use parking_lot::Mutex;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::Emitter;

static MODEL: Mutex<Option<ParakeetTDT>> = Mutex::new(None);
static DOWNLOAD_IN_PROGRESS: AtomicBool = AtomicBool::new(false);

const MODEL_REPO: &str = "https://huggingface.co/istupakov/parakeet-tdt-0.6b-v3-onnx/resolve/main";
const MODEL_FILES: &[(&str, bool)] = &[
    ("encoder-model.int8.onnx", true),     // ~652MB
    ("decoder_joint-model.int8.onnx", true), // ~18MB
    ("vocab.txt", false),
    ("config.json", false),
    ("nemo128.onnx", false),
];

// Known approximate total for progress display (~652 + ~18 + small files)
const APPROX_DOWNLOAD_BYTES: u64 = 680_000_000;

pub fn model_dir() -> PathBuf {
    let data_dir = dirs::data_dir().unwrap_or_else(|| PathBuf::from("."));
    data_dir.join("com.aarsla.audioshift").join("models").join("parakeet-tdt-0.6b-v3")
}

pub fn models_ready() -> bool {
    let dir = model_dir();
    // Check for the key renamed files (we rename int8 files to the names parakeet-rs expects)
    dir.join("encoder-model.onnx").exists()
        && dir.join("decoder_joint-model.onnx").exists()
        && dir.join("vocab.txt").exists()
}

pub fn model_disk_size() -> u64 {
    let dir = model_dir();
    if !dir.exists() {
        return 0;
    }
    std::fs::read_dir(&dir)
        .map(|entries| {
            entries
                .filter_map(|e| e.ok())
                .filter_map(|e| e.metadata().ok().map(|m| m.len()))
                .sum()
        })
        .unwrap_or(0)
}

pub async fn delete_model() -> Result<()> {
    // Unload the model first
    {
        let mut model_lock = MODEL.lock();
        *model_lock = None;
    }
    let dir = model_dir();
    if dir.exists() {
        tokio::fs::remove_dir_all(&dir).await?;
    }
    Ok(())
}

pub fn is_downloading() -> bool {
    DOWNLOAD_IN_PROGRESS.load(Ordering::Relaxed)
}

async fn download_file(
    url: &str,
    dest: &Path,
    app: &tauri::AppHandle,
    label: &str,
    cumulative_offset: u64,
) -> Result<u64> {
    use futures_util::StreamExt;

    let client = reqwest::Client::new();
    let resp = client.get(url).send().await?.error_for_status()?;
    let total = resp.content_length().unwrap_or(0);

    let mut stream = resp.bytes_stream();
    let mut file = tokio::fs::File::create(dest).await?;
    let mut downloaded: u64 = 0;
    let mut last_overall_pct: u32 =
        ((cumulative_offset as f64 / APPROX_DOWNLOAD_BYTES as f64) * 100.0).min(99.0) as u32;

    use tokio::io::AsyncWriteExt;
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
            ((overall_downloaded as f64 / APPROX_DOWNLOAD_BYTES as f64) * 100.0).min(99.0) as u32;

        // Only emit when integer overall_progress changes (throttle)
        if overall_progress != last_overall_pct {
            last_overall_pct = overall_progress;
            let _ = app.emit(
                "model-download-progress",
                serde_json::json!({
                    "file": label,
                    "progress": progress,
                    "downloaded": downloaded,
                    "total": total,
                    "overall_downloaded": overall_downloaded,
                    "overall_total": APPROX_DOWNLOAD_BYTES,
                    "overall_progress": overall_progress,
                }),
            );
        }
    }

    file.flush().await?;
    Ok(downloaded)
}

async fn do_ensure_model(app: &tauri::AppHandle) -> Result<()> {
    if models_ready() {
        return Ok(());
    }

    let dir = model_dir();
    tokio::fs::create_dir_all(&dir).await?;

    // Collect files that still need downloading (skip already present)
    let mut files_to_download: Vec<(&str, bool)> = Vec::new();
    for (filename, is_int8) in MODEL_FILES {
        let dest = dir.join(filename);
        if dest.exists() {
            continue;
        }
        if *is_int8 {
            let standard_name = filename.replace(".int8", "");
            if dir.join(&standard_name).exists() {
                continue;
            }
        }
        files_to_download.push((filename, *is_int8));
    }

    let _ = app.emit(
        "model-download-progress",
        serde_json::json!({
            "file": "starting",
            "progress": 0,
            "overall_downloaded": 0,
            "overall_total": APPROX_DOWNLOAD_BYTES,
            "overall_progress": 0,
        }),
    );

    let mut cumulative_offset: u64 = 0;
    for (filename, is_int8) in &files_to_download {
        let url = format!("{}/{}", MODEL_REPO, filename);
        let dest = dir.join(filename);

        let bytes_downloaded =
            download_file(&url, &dest, app, filename, cumulative_offset)
                .await
                .with_context(|| format!("Failed to download {}", filename))?;

        cumulative_offset += bytes_downloaded;

        // Rename int8 files to the standard names that parakeet-rs expects
        if *is_int8 {
            let standard_name = filename.replace(".int8", "");
            let standard_path = dir.join(&standard_name);
            if !standard_path.exists() {
                tokio::fs::rename(&dest, &standard_path).await?;
            }
        }
    }

    let _ = app.emit(
        "model-download-progress",
        serde_json::json!({
            "file": "complete",
            "progress": 100,
            "overall_downloaded": cumulative_offset,
            "overall_total": APPROX_DOWNLOAD_BYTES,
            "overall_progress": 100,
        }),
    );

    Ok(())
}

pub async fn ensure_model(app: &tauri::AppHandle) -> Result<()> {
    if models_ready() {
        return Ok(());
    }

    // Concurrency guard: only one download at a time
    if DOWNLOAD_IN_PROGRESS
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        // Another download is already in progress, events still flow from it
        return Ok(());
    }

    let result = do_ensure_model(app).await;
    DOWNLOAD_IN_PROGRESS.store(false, Ordering::SeqCst);
    result
}

fn default_execution_config() -> Option<ExecutionConfig> {
    #[cfg(windows)]
    {
        Some(
            ExecutionConfig::new()
                .with_execution_provider(ExecutionProvider::DirectML),
        )
    }
    #[cfg(not(windows))]
    {
        None
    }
}

fn load_model() -> Result<()> {
    let mut model_lock = MODEL.lock();
    if model_lock.is_some() {
        return Ok(());
    }

    let dir = model_dir();
    let parakeet = ParakeetTDT::from_pretrained(&dir, default_execution_config())
        .or_else(|_| {
            // GPU failed, fall back to CPU
            ParakeetTDT::from_pretrained(&dir, None)
        })
        .context("Failed to load Parakeet TDT model")?;
    *model_lock = Some(parakeet);

    Ok(())
}

pub async fn transcribe(app: &tauri::AppHandle, wav_path: &str) -> Result<String> {
    ensure_model(app).await?;

    // Load model on first use (blocking but only happens once)
    let _ = app.emit("status-changed", "transcribing");
    load_model()?;

    let wav_path = wav_path.to_string();
    let result = tokio::task::spawn_blocking(move || -> Result<_> {
        let mut model_lock = MODEL.lock();
        let model = model_lock.as_mut().context("Model not loaded")?;
        let result = model
            .transcribe_file(&wav_path, Some(TimestampMode::Sentences))
            .map_err(|e| anyhow::anyhow!("{}", e))?;
        Ok(result)
    })
    .await??;

    Ok(result.text)
}
