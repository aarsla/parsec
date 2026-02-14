use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::PathBuf;

const SAMPLE_RATE: u32 = 16000;
const BITS_PER_SAMPLE: u16 = 16;
const NUM_CHANNELS: u16 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordingMeta {
    pub id: String,
    pub text: String,
    pub timestamp: i64,
    pub app_name: Option<String>,
    pub window_title: Option<String>,
    pub char_count: usize,
    pub duration_ms: u64,
    pub processing_time_ms: u64,
    pub model_id: String,
    pub language: Option<String>,
    pub translate: bool,
    pub app_version: String,
}

pub fn recordings_dir() -> PathBuf {
    // ~/Documents/AudioShift/Recordings
    // For MAS (sandboxed), dirs::document_dir() returns the container's Documents
    // folder which is always writable without extra entitlements.
    let docs = dirs::document_dir().unwrap_or_else(|| PathBuf::from("."));
    docs.join("AudioShift").join("Recordings")
}

pub fn save_recording(samples: &[f32], meta: &RecordingMeta) -> Result<PathBuf> {
    let dir = recordings_dir().join(&meta.id);
    fs::create_dir_all(&dir).context("Failed to create recording directory")?;

    // Write WAV
    let wav_path = dir.join("output.wav");
    write_wav(&wav_path, samples)?;

    // Write meta
    let meta_path = dir.join("meta.json");
    let json = serde_json::to_string_pretty(meta).context("Failed to serialize meta")?;
    fs::write(&meta_path, json).context("Failed to write meta.json")?;

    Ok(dir)
}

pub fn load_all_recordings() -> Vec<RecordingMeta> {
    let base = recordings_dir();
    let entries = match fs::read_dir(&base) {
        Ok(e) => e,
        Err(_) => return Vec::new(),
    };

    let mut metas: Vec<RecordingMeta> = entries
        .filter_map(|entry| {
            let entry = entry.ok()?;
            if !entry.file_type().ok()?.is_dir() {
                return None;
            }
            let meta_path = entry.path().join("meta.json");
            let data = fs::read_to_string(&meta_path).ok()?;
            serde_json::from_str(&data).ok()
        })
        .collect();

    metas.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    metas
}

pub fn delete_recording(id: &str) -> Result<()> {
    let dir = recordings_dir().join(id);
    if dir.exists() {
        fs::remove_dir_all(&dir).context("Failed to delete recording directory")?;
    }
    Ok(())
}

pub fn clear_recordings() -> Result<()> {
    let base = recordings_dir();
    if base.exists() {
        let entries = fs::read_dir(&base).context("Failed to read recordings directory")?;
        for entry in entries.flatten() {
            if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                let _ = fs::remove_dir_all(entry.path());
            }
        }
    }
    Ok(())
}

fn write_wav(path: &PathBuf, samples: &[f32]) -> Result<()> {
    let byte_rate = SAMPLE_RATE * NUM_CHANNELS as u32 * BITS_PER_SAMPLE as u32 / 8;
    let block_align = NUM_CHANNELS * BITS_PER_SAMPLE / 8;
    let data_size = samples.len() as u32 * (BITS_PER_SAMPLE as u32 / 8);
    let file_size = 36 + data_size;

    let mut file = fs::File::create(path).context("Failed to create WAV file")?;

    // RIFF header
    file.write_all(b"RIFF")?;
    file.write_all(&file_size.to_le_bytes())?;
    file.write_all(b"WAVE")?;

    // fmt chunk
    file.write_all(b"fmt ")?;
    file.write_all(&16u32.to_le_bytes())?; // chunk size
    file.write_all(&1u16.to_le_bytes())?; // PCM format
    file.write_all(&NUM_CHANNELS.to_le_bytes())?;
    file.write_all(&SAMPLE_RATE.to_le_bytes())?;
    file.write_all(&byte_rate.to_le_bytes())?;
    file.write_all(&block_align.to_le_bytes())?;
    file.write_all(&BITS_PER_SAMPLE.to_le_bytes())?;

    // data chunk
    file.write_all(b"data")?;
    file.write_all(&data_size.to_le_bytes())?;

    // Convert f32 samples to i16 PCM
    for &sample in samples {
        let clamped = sample.clamp(-1.0, 1.0);
        let i16_val = (clamped * 32767.0) as i16;
        file.write_all(&i16_val.to_le_bytes())?;
    }

    Ok(())
}
