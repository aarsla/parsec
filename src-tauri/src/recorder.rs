use anyhow::{Context, Result};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::Stream;
use std::sync::Arc;
use tauri::Emitter;

use crate::state::{AppState, Status};

const SAMPLE_RATE: u32 = 16000;

// cpal::Stream is !Send+!Sync by design (platform audio callbacks).
// We only ever access this from the main thread, so this is safe.
struct SendStream(#[allow(dead_code)] Stream);
unsafe impl Send for SendStream {}
unsafe impl Sync for SendStream {}

static ACTIVE_STREAM: parking_lot::Mutex<Option<SendStream>> = parking_lot::Mutex::new(None);

pub fn list_input_devices() -> Vec<String> {
    let host = cpal::default_host();
    host.input_devices()
        .map(|devices| devices.filter_map(|d| d.name().ok()).collect())
        .unwrap_or_default()
}

pub fn start_recording(app: &tauri::AppHandle, state: &AppState) -> Result<()> {
    if state.status() == Status::Recording {
        anyhow::bail!("Already recording");
    }

    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .context("No input device available")?;

    let config = cpal::StreamConfig {
        channels: 1,
        sample_rate: cpal::SampleRate(SAMPLE_RATE),
        buffer_size: cpal::BufferSize::Default,
    };

    state.audio_buffer.lock().clear();
    let buffer_clone = Arc::clone(&state.audio_buffer);
    let app_handle = app.clone();

    let stream = device.build_input_stream(
        &config,
        move |data: &[f32], _: &cpal::InputCallbackInfo| {
            buffer_clone.lock().extend_from_slice(data);

            if !data.is_empty() {
                let amplitude: f32 = data.iter().map(|s| s.abs()).sum::<f32>() / data.len() as f32;
                let _ = app_handle.emit("audio-amplitude", amplitude);
            }
        },
        |err| {
            eprintln!("Audio stream error: {}", err);
        },
        None,
    )?;

    stream.play()?;
    *ACTIVE_STREAM.lock() = Some(SendStream(stream));

    state.set_status(Status::Recording);
    let _ = app.emit("status-changed", "recording");

    Ok(())
}

pub fn stop_recording(state: &AppState) -> Result<String> {
    let _ = ACTIVE_STREAM.lock().take();

    let samples = state.audio_buffer.lock().clone();
    if samples.is_empty() {
        state.set_status(Status::Idle);
        anyhow::bail!("No audio recorded");
    }

    let temp_dir = std::env::temp_dir();
    let wav_path = temp_dir.join("audioshift_recording.wav");
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate: SAMPLE_RATE,
        bits_per_sample: 32,
        sample_format: hound::SampleFormat::Float,
    };

    let mut writer = hound::WavWriter::create(&wav_path, spec)?;
    for sample in &samples {
        writer.write_sample(*sample)?;
    }
    writer.finalize()?;

    Ok(wav_path.to_string_lossy().to_string())
}

pub fn cancel_recording(state: &AppState) -> Result<()> {
    let _ = ACTIVE_STREAM.lock().take();
    state.audio_buffer.lock().clear();
    state.set_status(Status::Idle);
    Ok(())
}
