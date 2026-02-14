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
static MONITOR_STREAM: parking_lot::Mutex<Option<SendStream>> = parking_lot::Mutex::new(None);

/// Actual stream config used, so callbacks know how to convert.
#[derive(Clone)]
struct StreamParams {
    channels: u16,
    sample_rate: u32,
}

/// Check device capabilities and pick the best stream config.
/// Prefers 16kHz mono; falls back to device default (e.g. 48kHz stereo on Windows WASAPI).
fn resolve_stream_config(device: &cpal::Device) -> Result<(cpal::StreamConfig, StreamParams)> {
    let desired = cpal::StreamConfig {
        channels: 1,
        sample_rate: cpal::SampleRate(SAMPLE_RATE),
        buffer_size: cpal::BufferSize::Default,
    };

    // Check if any supported config range covers 16kHz mono
    let supports_desired = device
        .supported_input_configs()
        .map(|mut configs| {
            configs.any(|range| {
                range.channels() == 1
                    && range.min_sample_rate().0 <= SAMPLE_RATE
                    && range.max_sample_rate().0 >= SAMPLE_RATE
            })
        })
        .unwrap_or(false);

    if supports_desired {
        return Ok((desired, StreamParams { channels: 1, sample_rate: SAMPLE_RATE }));
    }

    // Fall back to device default
    let default_cfg = device
        .default_input_config()
        .context("Failed to get default input config")?;
    let channels = default_cfg.channels();
    let sample_rate = default_cfg.sample_rate().0;
    let config = cpal::StreamConfig {
        channels,
        sample_rate: cpal::SampleRate(sample_rate),
        buffer_size: cpal::BufferSize::Default,
    };
    Ok((config, StreamParams { channels, sample_rate }))
}

/// Build an input stream, using the best supported config for the device.
fn build_input_stream_robust<F>(
    device: &cpal::Device,
    mut callback: F,
) -> Result<Stream>
where
    F: FnMut(&[f32], &StreamParams) + Send + 'static,
{
    let (config, params) = resolve_stream_config(device)?;

    let stream = device.build_input_stream(
        &config,
        move |data: &[f32], _: &cpal::InputCallbackInfo| {
            callback(data, &params);
        },
        |err| {
            eprintln!("Audio stream error: {}", err);
        },
        None,
    )?;

    Ok(stream)
}

/// Mix multi-channel audio down to mono by averaging channels.
fn mix_to_mono(data: &[f32], channels: u16) -> Vec<f32> {
    if channels <= 1 {
        return data.to_vec();
    }
    let ch = channels as usize;
    data.chunks_exact(ch)
        .map(|frame| frame.iter().sum::<f32>() / ch as f32)
        .collect()
}

/// Resample mono audio from src_rate to dst_rate using linear interpolation.
fn resample_linear(data: &[f32], src_rate: u32, dst_rate: u32) -> Vec<f32> {
    if src_rate == dst_rate || data.is_empty() {
        return data.to_vec();
    }
    let ratio = src_rate as f64 / dst_rate as f64;
    let out_len = (data.len() as f64 / ratio).ceil() as usize;
    let mut out = Vec::with_capacity(out_len);
    for i in 0..out_len {
        let src_pos = i as f64 * ratio;
        let idx = src_pos as usize;
        let frac = src_pos - idx as f64;
        let sample = if idx + 1 < data.len() {
            data[idx] as f64 * (1.0 - frac) + data[idx + 1] as f64 * frac
        } else {
            data[idx.min(data.len() - 1)] as f64
        };
        out.push(sample as f32);
    }
    out
}

/// Convert raw callback data to 16kHz mono samples.
fn convert_samples(data: &[f32], params: &StreamParams) -> Vec<f32> {
    if params.channels == 1 && params.sample_rate == SAMPLE_RATE {
        return data.to_vec();
    }
    let mono = mix_to_mono(data, params.channels);
    resample_linear(&mono, params.sample_rate, SAMPLE_RATE)
}

pub fn list_input_devices() -> Vec<String> {
    let host = cpal::default_host();
    host.input_devices()
        .map(|devices| devices.filter_map(|d| d.name().ok()).collect())
        .unwrap_or_default()
}

fn find_device_by_name(host: &cpal::Host, name: &str) -> Option<cpal::Device> {
    host.input_devices()
        .ok()?
        .find(|d| d.name().ok().as_deref() == Some(name))
}

pub fn start_recording(app: &tauri::AppHandle, state: &AppState, device_name: Option<&str>) -> Result<()> {
    if state.status() == Status::Recording {
        anyhow::bail!("Already recording");
    }

    let host = cpal::default_host();
    let device = device_name
        .and_then(|name| find_device_by_name(&host, name))
        .or_else(|| host.default_input_device())
        .context("No input device available")?;

    state.audio_buffer.lock().clear();
    let buffer_clone = Arc::clone(&state.audio_buffer);
    let app_handle = app.clone();

    let stream = build_input_stream_robust(&device, move |data, params| {
        let samples = convert_samples(data, params);
        buffer_clone.lock().extend_from_slice(&samples);

        if !samples.is_empty() {
            let amplitude: f32 = samples.iter().map(|s| s.abs()).sum::<f32>() / samples.len() as f32;
            let _ = app_handle.emit("audio-amplitude", amplitude);
        }
    })?;

    stream.play()?;
    *ACTIVE_STREAM.lock() = Some(SendStream(stream));

    state.set_status(Status::Recording);
    let _ = app.emit("status-changed", "recording");

    Ok(())
}

fn pause_and_drop_stream(stream: Option<SendStream>) {
    if let Some(SendStream(stream)) = stream {
        let _ = stream.pause();
        drop(stream);
    }
}

pub fn stop_recording(state: &AppState) -> Result<Vec<f32>> {
    pause_and_drop_stream(ACTIVE_STREAM.lock().take());

    let samples = state.audio_buffer.lock().clone();
    if samples.is_empty() {
        state.set_status(Status::Idle);
        anyhow::bail!("No audio recorded");
    }

    Ok(samples)
}

pub fn start_monitor(app: &tauri::AppHandle, device_name: Option<&str>) -> Result<()> {
    // Stop any existing monitor first
    pause_and_drop_stream(MONITOR_STREAM.lock().take());

    let host = cpal::default_host();
    let device = match device_name {
        Some(name) => find_device_by_name(&host, name)
            .context(format!("Input device '{}' not found", name))?,
        None => host.default_input_device()
            .context("No default input device available")?,
    };

    let app_handle = app.clone();
    let last_emit = Arc::new(parking_lot::Mutex::new(std::time::Instant::now()));

    let stream = build_input_stream_robust(&device, move |data, params| {
        if data.is_empty() {
            return;
        }
        // Throttle to ~20 emits/sec (50ms interval)
        let mut last = last_emit.lock();
        let now = std::time::Instant::now();
        if now.duration_since(*last).as_millis() < 50 {
            return;
        }
        *last = now;
        let samples = convert_samples(data, params);
        if !samples.is_empty() {
            let amplitude: f32 = samples.iter().map(|s| s.abs()).sum::<f32>() / samples.len() as f32;
            let _ = app_handle.emit("monitor-amplitude", amplitude);
        }
    })?;

    stream.play()?;
    *MONITOR_STREAM.lock() = Some(SendStream(stream));
    Ok(())
}

pub fn stop_monitor() {
    pause_and_drop_stream(MONITOR_STREAM.lock().take());
}

pub fn cancel_recording(state: &AppState) -> Result<()> {
    pause_and_drop_stream(ACTIVE_STREAM.lock().take());
    state.audio_buffer.lock().clear();
    state.set_status(Status::Idle);
    Ok(())
}
