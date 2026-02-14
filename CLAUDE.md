# AudioShift

Local voice-to-text transcription desktop app. Tauri 2 + React 19 + Rust.

## Stack

- **Frontend:** React 19, TypeScript, Vite 7, Tailwind CSS 4, shadcn/ui (New York), Lucide icons
- **Backend:** Tauri 2, cpal (audio capture), parakeet-rs (local transcription), tokio
- **Plugins:** global-shortcut, store, autostart, updater, process, opener

## Structure

```
src-tauri/src/
  lib.rs            # App setup, mod declarations
  commands.rs       # All #[tauri::command] IPC handlers
  updater.rs        # Auto-update (#[cfg(feature = "updater")])
  login_item.rs     # MAS login item (#[cfg(feature = "mas")])
  windows.rs        # Window creation (overlay, settings, onboarding)
  tray.rs           # Tray menu, icons, status text, event listeners
  state.rs          # AppState: status, hotkey, tray handle, audio buffer
  recorder.rs       # Audio capture via cpal, WAV export
  transcriber.rs    # Model loading, download, transcription
  hotkey.rs         # Global shortcut registration
  paster.rs         # Clipboard paste simulation
  model_registry.rs # Model definitions, paths, readiness checks
  history.rs        # Transcription history storage
  escape_monitor.rs # Escape key listener during recording
  frontmost.rs      # Frontmost app name (macOS)
  plugins/          # Custom Tauri plugins

src/
  App.tsx                    # Route handler, theme init
  components/
    Settings.tsx             # Settings UI (state owner for all settings pages)
    Onboarding.tsx           # First-run wizard
    RecordingOverlay.tsx     # Recording overlay with waveform
    History.tsx              # Transcription history browser
    settings/                # Sub-pages (GeneralPage, ModelPage, AboutPage, etc.)
    ui/                      # shadcn primitives
```

## Architecture

- **Windows:** overlay (hidden, always-on-top), settings (from tray), onboarding (first-run)
- **IPC:** Frontend `invoke()` → Rust. Rust `app.emit()` → Frontend `listen()`.
- **State flow:** Hotkey → event → overlay invokes start/stop → recorder → transcriber → paster
- **Theming:** CSS vars on `:root`, `.dark` class, accent via `style.setProperty`. Dual-persisted: localStorage (sync, flash-free) + tauri store (durable)
- **Tray:** Dynamic icon/text via handles stored in AppState
- **Model preloading:** Model loaded into memory at startup + on model change for instant first transcription

## Build Variants

| | Direct | Mac App Store |
|---|---|---|
| Features | `default` (includes `updater`) | `mas` (no updater, no autostart) |
| Config | `tauri.conf.json` | `tauri.mas.conf.json` |
| macOSPrivateApi | `true` (transparent overlay) | `false` (CALayer fallback) |
| Distribution | DMG + updater | `.app` for App Store |
| Bundle ID | `com.aarsla.audioshift` | `io.audioshift.app` |

Feature gates: `#[cfg(feature = "updater")]`, `#[cfg(feature = "mas")]`, `#[cfg(not(feature = "mas"))]`, `#[cfg(target_os = "macos")]`

## Commands

```bash
make dev          # Dev with hot reload
make build        # Production (direct)
make build-mas    # Mac App Store (.app, aarch64)
make check        # Rust check (direct)
make check-mas    # Rust check (MAS)
make check-ts     # TypeScript check
make check-all    # All checks
```

**`cargo check` alone won't work** — Tauri build script needs `macOSPrivateApi` config. Always use `make check` / `make check-mas`.

`make dev` runs a bare binary. macOS Accessibility permissions are per-binary and reset on recompile. If paste breaks: `pnpm tauri build --debug --bundles app --target aarch64-apple-darwin`, then re-grant Accessibility.

## Reactive UI

The frontend must always reflect current backend state. These rules apply to all new and existing code:

1. **Backend state changes → emit event.** Rust `app.emit()` on every state change. Frontend `listen()` — never poll.
2. **Async ops → loading state.** Every user-triggered async operation shows a loading/progress indicator for its entire duration.
3. **Errors → user feedback.** Failed `invoke()` calls must surface errors visibly. Never silently swallow.
4. **Optimistic updates → rollback on failure.** Capture previous value, `setState(new)`, revert in `catch`.
5. **Resource lists → refresh on focus.** Device lists, permissions, model statuses refresh on window focus, not only on mount.
6. **Events over polling.** Prefer `listen()` over `setInterval`. Add Rust events rather than JS polling.
7. **Parent owns listeners.** Tauri `listen()` in parent component, pass data as props. Child listeners may miss events (known Tauri/webview issue).

### Event Naming

| Pattern | Convention | Examples |
|---|---|---|
| State change | `{noun}-changed` | `status-changed`, `live-model-changed` |
| Lifecycle | `{noun}-{start\|done\|error}` | `model-preload-start`, `model-preload-done` |
| Progress | `{noun}-progress` | `model-download-progress`, `update-download-progress` |
| Action | `{noun}-{verb}` | `recording-toggle`, `history-updated` |

## Conventions

- Tailwind v4 `@theme inline` with OKLch color space
- Path alias: `@/` → `src/`
- Settings dual-persisted: `localStorage` (sync, flash-free) + tauri store `settings.json` (durable)
- Tray menu items stored in AppState for runtime updates
- Platform-conditional deps under `[target.'cfg(...)'.dependencies]`
- Commands are `pub` in `commands.rs`, referenced as `commands::func_name` in `generate_handler!`
- Updater and login_item commands in own modules (not commands.rs) due to `#[cfg]` gating
