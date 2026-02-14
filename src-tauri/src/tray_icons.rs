/// Programmatic tray icon rendering for animated states.
/// Renders 22x22 RGBA pixel data matching the existing tray icon bar layout.

const SIZE: usize = 22;
const NUM_BARS: usize = 6;

/// Bar definitions: (x_start, width, default_height).
/// 6 bars, 2px wide, evenly spaced across 22px canvas.
const BARS: [(usize, usize, usize); NUM_BARS] = [
    (0, 2, 3),
    (4, 2, 11),
    (8, 2, 18),
    (12, 2, 7),
    (16, 2, 13),
    (20, 2, 3),
];

/// Per-bar phase offsets and angular frequencies (radians per frame at ~100ms).
/// Periods range from ~0.8s to ~1.5s, matching the About screen wave animation.
const PHASES: [f32; NUM_BARS] = [0.0, 2.1, 0.7, 3.8, 1.4, 4.5];
const FREQS: [f32; NUM_BARS] = [0.52, 0.71, 0.41, 0.63, 0.47, 0.58];

pub const ICON_SIZE: u32 = SIZE as u32;

/// Single filled bar at `active_index` (0..5), rest invisible. For preload sweep animation.
pub fn preload_frame(active_index: usize) -> Vec<u8> {
    let mut rgba = vec![0u8; SIZE * SIZE * 4];
    let idx = active_index % NUM_BARS;
    let (bx, bw, bh) = BARS[idx];
    draw_bar(&mut rgba, bx, bw, bh);
    rgba
}

/// All bars oscillate independently via sine waves (like About screen animation).
/// `tick` advances each frame. `amplitude` (0.0–1.0) modulates overall height envelope.
pub fn recording_frame(tick: u32, amplitude: f32) -> Vec<u8> {
    let mut rgba = vec![0u8; SIZE * SIZE * 4];
    let amp = amplitude.clamp(0.0, 1.0);
    let t = tick as f32;

    for (i, &(bx, bw, bh)) in BARS.iter().enumerate() {
        // Sine wave oscillation: 0.0 → 1.0
        let wave = (t * FREQS[i] + PHASES[i]).sin() * 0.5 + 0.5;
        // At silence: bars oscillate between 30%–60% of height
        // At full amplitude: bars oscillate between 30%–100%
        let max_scale = 0.6 + 0.4 * amp;
        let scale = 0.3 + (max_scale - 0.3) * wave;
        let h = ((bh as f32 * scale).round() as usize).max(2);
        draw_bar(&mut rgba, bx, bw, h);
    }
    rgba
}

/// Draw a filled bar centered vertically on the canvas.
/// Black (0,0,0) with full alpha — works with macOS template icon mode.
fn draw_bar(rgba: &mut [u8], x: usize, w: usize, h: usize) {
    let top = (SIZE - h) / 2;
    for row in top..top + h {
        for col in x..x + w {
            let offset = (row * SIZE + col) * 4;
            rgba[offset + 3] = 255; // alpha only; R/G/B stay 0
        }
    }
}
