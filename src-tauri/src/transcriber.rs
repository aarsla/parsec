use anyhow::{Context, Result};
use parakeet_rs::{ParakeetTDT, TimestampMode, Transcriber};
use parking_lot::Mutex;
use std::path::{Path, PathBuf};
use tauri::Emitter;

static MODEL: Mutex<Option<ParakeetTDT>> = Mutex::new(None);

const MODEL_REPO: &str = "https://huggingface.co/istupakov/parakeet-tdt-0.6b-v3-onnx/resolve/main";
const MODEL_FILES: &[(&str, bool)] = &[
    ("encoder-model.int8.onnx", true),     // ~652MB
    ("decoder_joint-model.int8.onnx", true), // ~18MB
    ("vocab.txt", false),
    ("config.json", false),
    ("nemo128.onnx", false),
];

fn model_dir() -> PathBuf {
    let data_dir = dirs::data_dir().unwrap_or_else(|| PathBuf::from("."));
    data_dir.join("com.aarsla.vtt").join("models").join("parakeet-tdt-0.6b-v3")
}

fn models_ready() -> bool {
    let dir = model_dir();
    // Check for the key renamed files (we rename int8 files to the names parakeet-rs expects)
    dir.join("encoder-model.onnx").exists()
        && dir.join("decoder_joint-model.onnx").exists()
        && dir.join("vocab.txt").exists()
}

async fn download_file(url: &str, dest: &Path, app: &tauri::AppHandle, label: &str) -> Result<()> {
    use futures_util::StreamExt;

    let client = reqwest::Client::new();
    let resp = client.get(url).send().await?.error_for_status()?;
    let total = resp.content_length().unwrap_or(0);

    let mut stream = resp.bytes_stream();
    let mut file = tokio::fs::File::create(dest).await?;
    let mut downloaded: u64 = 0;

    use tokio::io::AsyncWriteExt;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        file.write_all(&chunk).await?;
        downloaded += chunk.len() as u64;

        if total > 0 {
            let progress = (downloaded as f64 / total as f64 * 100.0) as u32;
            let _ = app.emit("model-download-progress", serde_json::json!({
                "file": label,
                "progress": progress,
                "downloaded": downloaded,
                "total": total,
            }));
        }
    }

    file.flush().await?;
    Ok(())
}

pub async fn ensure_model(app: &tauri::AppHandle) -> Result<()> {
    if models_ready() {
        return Ok(());
    }

    let dir = model_dir();
    tokio::fs::create_dir_all(&dir).await?;

    let _ = app.emit("model-download-progress", serde_json::json!({
        "file": "starting",
        "progress": 0,
    }));

    for (filename, is_int8) in MODEL_FILES {
        let url = format!("{}/{}", MODEL_REPO, filename);
        let dest = dir.join(filename);

        if dest.exists() {
            continue;
        }

        download_file(&url, &dest, app, filename).await
            .with_context(|| format!("Failed to download {}", filename))?;

        // Rename int8 files to the standard names that parakeet-rs expects
        if *is_int8 {
            let standard_name = filename.replace(".int8", "");
            let standard_path = dir.join(&standard_name);
            if !standard_path.exists() {
                tokio::fs::rename(&dest, &standard_path).await?;
            }
        }
    }

    let _ = app.emit("model-download-progress", serde_json::json!({
        "file": "complete",
        "progress": 100,
    }));

    Ok(())
}

fn load_model() -> Result<()> {
    let mut model_lock = MODEL.lock();
    if model_lock.is_some() {
        return Ok(());
    }

    let dir = model_dir();
    let parakeet = ParakeetTDT::from_pretrained(&dir, None)
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
