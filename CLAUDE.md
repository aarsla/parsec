# AudioShift

Local voice-to-text transcription desktop app. Tauri 2 + React 19 + Rust.

## Stack

- **Frontend:** React 19, TypeScript, Vite 7, Tailwind CSS 4, shadcn/ui (New York), Lucide icons
- **Backend:** Tauri 2, cpal (audio capture), parakeet-rs (local transcription), tokio
- **Plugins:** global-shortcut, store, autostart, updater, process, opener

## Structure

```
src-tauri/src/
  lib.rs            # App builder, setup closure, mod declarations
  commands.rs       # All #[tauri::command] functions (IPC handlers)
  updater.rs        # Auto-update check/install (#[cfg(feature = "updater")])
  login_item.rs     # MAS login item via SMAppService (#[cfg(feature = "mas")])
  windows.rs        # Window creation (overlay, settings, onboarding)
  tray.rs           # Tray menu, icons, status text, event listeners
  state.rs          # AppState: status, hotkey, tray handle, audio buffer
  recorder.rs       # Audio capture via cpal, WAV export
  transcriber.rs    # Model loading, download, transcription (Parakeet + Whisper)
  hotkey.rs         # Global shortcut registration
  paster.rs         # Clipboard paste simulation
  model_registry.rs # Model definitions, paths, readiness checks
  history.rs        # Transcription history storage
  escape_monitor.rs # Escape key listener during recording
  frontmost.rs      # Get frontmost app name (macOS)
  plugins/          # Custom Tauri plugins (mac_rounded_corners)
  main.rs           # Entry point

src/
  App.tsx            # Route handler (overlay | settings | onboarding), theme init
  components/
    Settings.tsx     # Full settings UI (tabbed, persisted via tauri store + localStorage)
    Onboarding.tsx   # First-run setup wizard
    RecordingOverlay.tsx  # Recording status overlay with waveform
    Waveform.tsx     # Canvas-based audio visualization
    settings/        # Settings sub-pages (GeneralPage, AboutPage, etc.)
    ui/              # shadcn primitives (switch, select, separator, scroll-area)
```

## Architecture

- **Windows:** overlay (hidden, always-on-top), settings (on-demand from tray), onboarding (first-run)
- **IPC:** Frontend calls Rust via `invoke()`, Rust emits events (`status-changed`, `recording-toggle`, `audio-amplitude`)
- **State flow:** Hotkey press → event → overlay invokes start/stop → recorder captures → transcriber processes → paster outputs
- **Theming:** CSS variables on `:root`, `.dark` class toggle, accent colors via `style.setProperty`. Sync'd to localStorage (flash-free) + tauri store (persistent)
- **Tray:** Dynamic icon (normal/recording), status text updates via stored handles in AppState
- **Model preloading:** AI model is loaded into memory at startup and when live model changes, so first transcription is instant

## Build Variants

Two build targets with different Cargo features:

| | Direct | Mac App Store |
|---|---|---|
| Features | `default` (includes `updater`) | `mas` (no updater, no autostart) |
| Config | `tauri.conf.json` | `tauri.mas.conf.json` (overlay merge) |
| macOSPrivateApi | `true` (transparent overlay) | `false` (CALayer rounded corners fallback) |
| Distribution | DMG + updater | `.app` for App Store submission |
| Bundle ID | `com.aarsla.audioshift` | `io.audioshift.app` |

### Feature-gated code patterns
- `#[cfg(feature = "updater")]` — updater plugin, update check/install commands
- `#[cfg(feature = "mas")]` — login item via SMAppService, CALayer overlay corners, no autostart plugin
- `#[cfg(not(feature = "mas"))]` — transparent overlay, autostart plugin
- `#[cfg(target_os = "macos")]` — permissions, dock visibility, work area, Obj-C FFI

## Commands

Use `make` targets for common operations:

```bash
make dev            # Dev mode with hot reload
make build          # Production build (direct distribution)
make build-mas      # Mac App Store build (.app bundle, aarch64)
make check          # Rust check (direct) — requires TAURI_CONFIG env
make check-mas      # Rust check (MAS)
make check-ts       # TypeScript check
make check-all      # All checks
```

**Important:** `cargo check` alone won't work — Tauri's build script requires `macOSPrivateApi` config. Always use `make check` / `make check-mas` which set the correct env vars.

Note: `make dev` runs a bare binary without an `.app` bundle. macOS Accessibility permissions are per-binary and get lost on recompile. If paste stops working in dev, rebuild as `.app` bundle (`pnpm tauri build --debug --bundles app --target aarch64-apple-darwin`) and re-grant Accessibility.

## Conventions

- Tailwind v4 `@theme inline` with OKLch color space
- Path alias: `@/` → `src/`
- Settings persisted to both `localStorage` (sync, flash-free) and tauri store `settings.json` (durable)
- Tray menu items stored in AppState for runtime text/icon updates
- Platform-conditional deps under `[target.'cfg(...)'.dependencies]`
- Commands are `pub` in `commands.rs`, referenced as `commands::func_name` in `generate_handler!`
- Updater and login_item commands live in their own modules (not commands.rs) due to `#[cfg]` gating
