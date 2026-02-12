use anyhow::{Context, Result};
use std::path::Path;
use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::DecoderOptions;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;

const TARGET_SAMPLE_RATE: u32 = 16000;

/// Decode any supported audio file to mono f32 samples at its native sample rate.
fn decode_audio(input_path: &Path) -> Result<(Vec<f32>, u32)> {
    let file = std::fs::File::open(input_path)
        .with_context(|| format!("Cannot open {:?}", input_path))?;
    let mss = MediaSourceStream::new(Box::new(file), Default::default());

    let mut hint = Hint::new();
    if let Some(ext) = input_path.extension().and_then(|e| e.to_str()) {
        hint.with_extension(ext);
    }

    let probed = symphonia::default::get_probe()
        .format(
            &hint,
            mss,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )
        .context("Unsupported audio format")?;

    let mut format = probed.format;

    let track = format
        .default_track()
        .context("No audio track found")?;
    let track_id = track.id;
    let channels = track
        .codec_params
        .channels
        .map(|c| c.count())
        .unwrap_or(1) as usize;
    let sample_rate = track
        .codec_params
        .sample_rate
        .context("Unknown sample rate")?;

    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .context("Unsupported codec")?;

    let mut all_samples: Vec<f32> = Vec::new();

    loop {
        let packet = match format.next_packet() {
            Ok(p) => p,
            Err(symphonia::core::errors::Error::IoError(ref e))
                if e.kind() == std::io::ErrorKind::UnexpectedEof =>
            {
                break;
            }
            Err(e) => return Err(e.into()),
        };

        if packet.track_id() != track_id {
            continue;
        }

        let decoded = match decoder.decode(&packet) {
            Ok(d) => d,
            Err(symphonia::core::errors::Error::DecodeError(_)) => continue,
            Err(e) => return Err(e.into()),
        };

        let spec = *decoded.spec();
        let num_frames = decoded.capacity();
        let mut sample_buf = SampleBuffer::<f32>::new(num_frames as u64, spec);
        sample_buf.copy_interleaved_ref(decoded);
        let samples = sample_buf.samples();

        if channels == 1 {
            all_samples.extend_from_slice(samples);
        } else {
            // Downmix to mono by averaging channels
            for chunk in samples.chunks(channels) {
                let avg: f32 = chunk.iter().sum::<f32>() / channels as f32;
                all_samples.push(avg);
            }
        }
    }

    Ok((all_samples, sample_rate))
}

/// Resample f32 mono audio from `from_rate` to `to_rate` using rubato.
fn resample(samples: &[f32], from_rate: u32, to_rate: u32) -> Result<Vec<f32>> {
    use rubato::{FastFixedIn, PolynomialDegree, Resampler};

    let mut resampler = FastFixedIn::<f32>::new(
        to_rate as f64 / from_rate as f64,
        2.0,
        PolynomialDegree::Linear,
        samples.len().min(4096),
        1, // mono
    )?;

    let mut output = Vec::new();
    let chunk_size = resampler.input_frames_max();
    let mut pos = 0;

    while pos < samples.len() {
        let end = (pos + chunk_size).min(samples.len());
        let mut chunk = samples[pos..end].to_vec();

        // Pad last chunk if needed
        if chunk.len() < resampler.input_frames_next() {
            chunk.resize(resampler.input_frames_next(), 0.0);
        }

        let result = resampler.process(&[chunk], None)?;
        output.extend_from_slice(&result[0]);
        pos = end;
    }

    Ok(output)
}

/// Decode any supported audio file to 16kHz mono f32 samples.
/// Returns (samples, audio duration in seconds).
pub fn decode_to_samples(input_path: &Path) -> Result<(Vec<f32>, f64)> {
    let (samples, sample_rate) = decode_audio(input_path)?;
    let duration_secs = samples.len() as f64 / sample_rate as f64;

    let mono_16k = if sample_rate == TARGET_SAMPLE_RATE {
        samples
    } else {
        resample(&samples, sample_rate, TARGET_SAMPLE_RATE)?
    };

    Ok((mono_16k, duration_secs))
}
