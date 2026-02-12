# AudioShift

Local voice-to-text transcription for your desktop. Press a shortcut, speak, and your words appear as text — all processed on your device.

No accounts. No subscriptions. No cloud.

<img src="assets/audioshift.png" alt="AudioShift" width="100%">

**[Download](https://github.com/aarsla/audioshift/releases)** | **[Website](https://audioshift.io)**

## Features

- **Global hotkey** — trigger recording from any app with `Option+Space` on Mac / `Ctrl+Space` on Windows (customizable)
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
| macOS | 12+ | Apple Silicon |
| Windows | 10+ | x86_64 |

## Installation

Download the latest release from the [releases page](https://github.com/aarsla/audioshift/releases).

### macOS

The app is signed and notarized. Make sure **System Settings → Privacy & Security → Allow applications from** is set to **App Store and identified developers** (the macOS default). On first launch, macOS will show a confirmation dialog — click **Open** to proceed.

Two permissions are required:
- **Microphone** — to capture audio for transcription
- **Accessibility** — to paste transcribed text into the active application

You'll be prompted to grant these on first use. They can be managed in **System Settings → Privacy & Security**.

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
