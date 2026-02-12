# AudioShift

Local voice-to-text transcription for your desktop. Press a shortcut, speak, and your words appear as text — all processed on your device.

No accounts. No subscriptions. No cloud.

**[Download](https://github.com/aarsla/audioshift/releases)** | **[Website](https://audioshift.io)**

## Features

- **Global hotkey** — trigger recording from any app with `Cmd+Shift+Space` (customizable)
- **Local transcription** — powered by [Parakeet TDT 0.6B](https://huggingface.co/istupakov/parakeet-tdt-0.6b-v3-onnx), runs entirely on-device
- **Auto-paste** — transcribed text is inserted directly into the active application
- **Transcription history** — stores up to 500 entries with app context
- **Recording overlay** — four visual themes with real-time waveform visualization
- **Customizable** — themes (light/dark/system), accent colors, overlay position, start sounds

## Privacy

AudioShift processes everything locally. Zero network calls during transcription, no API keys, no audio storage. The speech model is downloaded once on first launch and runs offline from that point.

## System Requirements

| Platform | Version | Architecture |
|----------|---------|-------------|
| macOS | 12+ | Apple Silicon, x86_64 |
| Windows | 10+ | x86_64 |
| Linux | Ubuntu 22.04+ | x86_64 |

## Development

### Prerequisites

- [Rust](https://rustup.rs/) (latest stable)
- [Node.js](https://nodejs.org/) 18+
- [pnpm](https://pnpm.io/)

### Commands

```bash
pnpm install              # Install dependencies
pnpm tauri dev            # Dev mode with hot reload
pnpm tauri build          # Production build
cargo check --manifest-path src-tauri/Cargo.toml  # Rust type check
npx tsc --noEmit          # TypeScript type check
```

### Stack

- **Frontend:** React 19, TypeScript, Vite 7, Tailwind CSS 4, shadcn/ui
- **Backend:** Tauri 2, cpal (audio capture), parakeet-rs (transcription), tokio
- **Plugins:** global-shortcut, store, autostart, updater, process, opener

## License

MIT
