# Parsec

Local voice-to-text transcription desktop app. Tauri 2 + React 19 + Rust.

## Stack

- **Frontend:** React 19, TypeScript, Vite 7, Tailwind CSS 4, shadcn/ui (New York), Lucide icons
- **Backend:** Tauri 2, cpal (audio capture), parakeet-rs (local transcription), tokio
- **Plugins:** global-shortcut, store, autostart, updater, process, opener

## Structure

```
src-tauri/src/
  lib.rs          # Tauri setup, tray menu, commands, window creation
  state.rs        # AppState: status, hotkey, tray handle, audio buffer
  recorder.rs     # Audio capture via cpal, WAV export
  transcriber.rs  # Local transcription via parakeet-rs
  hotkey.rs       # Global shortcut registration
  paster.rs       # Clipboard paste simulation
  main.rs         # Entry point

src/
  App.tsx          # Route handler (overlay | settings), theme init, recording toggle
  components/
    Settings.tsx   # Full settings UI (6 sections, persisted via tauri store + localStorage)
    RecordingOverlay.tsx  # Recording status overlay with waveform
    Waveform.tsx   # Canvas-based audio visualization
    ui/            # shadcn primitives (switch, select, separator, scroll-area)
```

## Architecture

- **Windows:** overlay (hidden, always-on-top), settings (on-demand from tray)
- **IPC:** Frontend calls Rust via `invoke()`, Rust emits events (`status-changed`, `recording-toggle`, `audio-amplitude`)
- **State flow:** Hotkey press → event → overlay invokes start/stop → recorder captures → transcriber processes → paster outputs
- **Theming:** CSS variables on `:root`, `.dark` class toggle, accent colors via `style.setProperty`. Sync'd to localStorage (flash-free) + tauri store (persistent)
- **Tray:** Dynamic icon (normal/recording), status text updates via stored handles in AppState

## Commands

```bash
pnpm tauri dev     # Dev mode with hot reload
pnpm tauri build   # Production build (set TAURI_SIGNING_PRIVATE_KEY_PATH for updater)
cargo check --manifest-path src-tauri/Cargo.toml  # Rust check only
npx tsc --noEmit   # TypeScript check only
```

## Conventions

- Tailwind v4 `@theme inline` with OKLch color space
- Path alias: `@/` → `src/`
- Settings persisted to both `localStorage` (sync, flash-free) and tauri store `settings.json` (durable)
- Tray menu items stored in AppState for runtime text/icon updates
- Platform-conditional deps under `[target.'cfg(...)'.dependencies]`
