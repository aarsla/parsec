import { useState, useCallback, useEffect } from "react";
import { Check, Sun, Moon, Monitor } from "lucide-react";

// --- Types ---

export type PermissionStatus = "granted" | "denied" | "unknown" | "checking";
export type Section = "general" | "appearance" | "permissions" | "recording" | "output" | "history" | "model" | "updates" | "about";

export type ThemeMode = "light" | "dark" | "system";
export type AccentColor = "zinc" | "orange" | "teal" | "green" | "blue" | "purple" | "red";
export type StartSound = "chirp" | "ping" | "blip" | "none";
export type OverlayTheme = "default" | "minimal" | "glass" | "compact";
export type OverlayPosition =
  | "top-left" | "top-center" | "top-right"
  | "center-left" | "center" | "center-right"
  | "bottom-left" | "bottom-center" | "bottom-right";
export type UpdateStatus = "idle" | "checking" | "available" | "downloading" | "up-to-date" | "error" | "restart-pending";

export interface ModelStatusEntry {
  id: string;
  name: string;
  engine: "parakeet" | "whisper";
  description: string;
  sizeLabel: string;
  ready: boolean;
  diskSize: number;
  path: string;
}

export interface DownloadProgress {
  file: string;
  modelId?: string;
  progress: number;
  downloaded?: number;
  total?: number;
}

// --- Constants ---

export const ACCENT_PRESETS: Record<AccentColor, { light: string; dark: string }> = {
  zinc:   { light: "oklch(0.205 0 0)",     dark: "oklch(0.75 0.01 75)" },
  orange: { light: "oklch(0.58 0.19 55)",  dark: "oklch(0.75 0.16 55)" },
  teal:   { light: "oklch(0.52 0.14 180)", dark: "oklch(0.72 0.14 180)" },
  green:  { light: "oklch(0.52 0.16 150)", dark: "oklch(0.72 0.17 150)" },
  blue:   { light: "oklch(0.50 0.18 250)", dark: "oklch(0.70 0.17 250)" },
  purple: { light: "oklch(0.50 0.20 300)", dark: "oklch(0.70 0.19 300)" },
  red:    { light: "oklch(0.55 0.22 25)",  dark: "oklch(0.70 0.19 25)" },
};

export const ACCENT_COLORS: { id: AccentColor; label: string; swatch: string }[] = [
  { id: "zinc", label: "Zinc", swatch: "bg-zinc-600 dark:bg-zinc-400" },
  { id: "orange", label: "Orange", swatch: "bg-orange-500" },
  { id: "teal", label: "Teal", swatch: "bg-teal-500" },
  { id: "green", label: "Green", swatch: "bg-emerald-500" },
  { id: "blue", label: "Blue", swatch: "bg-blue-500" },
  { id: "purple", label: "Purple", swatch: "bg-purple-500" },
  { id: "red", label: "Red", swatch: "bg-red-500" },
];

export const OVERLAY_THEMES: { id: OverlayTheme; label: string; desc: string }[] = [
  { id: "default", label: "Default", desc: "Waveform + controls" },
  { id: "minimal", label: "Minimal", desc: "Pill with timer" },
  { id: "glass", label: "Glass", desc: "Frosted blur" },
  { id: "compact", label: "Compact", desc: "Timer only" },
];

export const OVERLAY_POSITIONS: OverlayPosition[] = [
  "top-left", "top-center", "top-right",
  "center-left", "center", "center-right",
  "bottom-left", "bottom-center", "bottom-right",
];

export const START_SOUNDS: { id: StartSound; label: string }[] = [
  { id: "chirp", label: "Chirp" },
  { id: "ping", label: "Ping" },
  { id: "blip", label: "Blip" },
  { id: "none", label: "None" },
];

// --- Theme helpers ---

export function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  if (mode === "dark") {
    root.classList.add("dark");
  } else if (mode === "light") {
    root.classList.remove("dark");
  } else {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.classList.toggle("dark", prefersDark);
  }
  const accent = (localStorage.getItem("accentColor") || "orange") as AccentColor;
  applyAccentVars(accent);
}

export function applyAccentVars(accent: AccentColor) {
  const root = document.documentElement;
  const isDark = root.classList.contains("dark");
  const preset = ACCENT_PRESETS[accent];
  const color = isDark ? preset.dark : preset.light;
  const vars = ["--primary", "--ring", "--sidebar-primary", "--sidebar-ring"];
  vars.forEach((v) => root.style.setProperty(v, color));
}

export function applyAccent(accent: AccentColor) {
  applyAccentVars(accent);
}

// --- Utility ---

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 1 ? 1 : 0)} ${units[i]}`;
}

function keyEventToShortcut(e: KeyboardEvent): string | null {
  const key = e.key;
  if (["Control", "Shift", "Alt", "Meta"].includes(key)) return null;

  const parts: string[] = [];
  if (e.metaKey || e.ctrlKey) parts.push("CmdOrCtrl");
  if (e.shiftKey) parts.push("Shift");
  if (e.altKey) parts.push("Alt");
  if (parts.length === 0) return null;

  let normalizedKey = key;
  const keyMap: Record<string, string> = {
    " ": "Space",
    "\u00A0": "Space",
    ArrowUp: "Up",
    ArrowDown: "Down",
    ArrowLeft: "Left",
    ArrowRight: "Right",
    Enter: "Enter",
    Escape: "Escape",
    Backspace: "Backspace",
    Delete: "Delete",
    Tab: "Tab",
  };

  if (keyMap[key]) {
    normalizedKey = keyMap[key];
  } else if (e.code === "Space") {
    normalizedKey = "Space";
  } else if (key.length === 1) {
    normalizedKey = key.toUpperCase();
  }

  parts.push(normalizedKey);
  return parts.join("+");
}

export function shortcutToDisplay(shortcut: string): string {
  if (navigator.userAgent.includes("Mac")) {
    return shortcut
      .replace("CmdOrCtrl", "\u2318")
      .replace("Cmd", "\u2318")
      .replace("Ctrl", "\u2303")
      .replace("Shift", "\u21E7")
      .replace("Alt", "\u2325")
      .replace("Space", "Space")
      .replace(/\+/g, " ");
  }
  return shortcut.replace(/\+/g, " + ");
}

// --- Shared sub-components ---

export function SettingRow({
  label,
  description,
  note,
  children,
}: {
  label: string;
  description?: React.ReactNode;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground">{label}</div>
        {description && (
          <div className="text-xs text-muted-foreground mt-0.5">
            {description}
          </div>
        )}
        {note && (
          <div className="text-[11px] text-muted-foreground/70 mt-0.5">
            {note}
          </div>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function SectionCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-visible">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
        {icon && (
          <span className="text-muted-foreground">{icon}</span>
        )}
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
      </div>
      <div className="px-4">{children}</div>
    </div>
  );
}

export function PermissionIndicator({
  label,
  status,
  onOpen,
}: {
  label: string;
  status: PermissionStatus;
  onOpen: () => void;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-2.5">
        <div
          className={`w-2 h-2 rounded-full shrink-0 ${
            status === "granted"
              ? "bg-emerald-500"
              : status === "checking"
                ? "bg-muted-foreground animate-pulse"
                : "bg-primary"
          }`}
        />
        <span className="text-sm text-foreground">{label}</span>
        <span className="text-xs text-muted-foreground">
          {status === "granted"
            ? "access granted"
            : status === "checking"
              ? "checking..."
              : "not granted"}
        </span>
      </div>
      <button
        onClick={onOpen}
        className="px-2.5 py-1 text-xs rounded-md bg-secondary border border-border
                   hover:bg-accent text-muted-foreground transition-colors"
      >
        {status === "granted" ? "Settings" : "Grant"}
      </button>
    </div>
  );
}

export function NavItem({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
          : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50"
      }`}
    >
      <span style={active ? { color: "var(--primary)" } : undefined}>{icon}</span>
      {label}
    </button>
  );
}

export function HotkeyRecorder({
  value,
  onChange,
}: {
  value: string;
  onChange: (shortcut: string) => void;
}) {
  const [recording, setRecording] = useState(false);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        setRecording(false);
        return;
      }

      const shortcut = keyEventToShortcut(e);
      if (shortcut) {
        setRecording(false);
        onChange(shortcut);
      }
    },
    [onChange]
  );

  useEffect(() => {
    if (!recording) return;
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [recording, handleKeyDown]);

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => setRecording(!recording)}
        className={`px-3 py-1 text-sm rounded-md border font-mono transition-colors ${
          recording
            ? "bg-primary/15 border-primary text-primary"
            : "bg-secondary border-border text-foreground hover:border-primary/40"
        }`}
      >
        {recording ? "Press shortcut..." : shortcutToDisplay(value)}
      </button>
      <button
        onClick={() => setRecording(!recording)}
        className="px-2.5 py-1 text-xs rounded-md bg-secondary border border-border
                   hover:bg-accent text-muted-foreground transition-colors"
      >
        {recording ? "Cancel" : "Change"}
      </button>
      {recording && (
        <span className="text-xs text-muted-foreground">
          Esc to cancel
        </span>
      )}
    </div>
  );
}

export function ThemePicker({
  value,
  onChange,
}: {
  value: ThemeMode;
  onChange: (mode: ThemeMode) => void;
}) {
  const modes: { id: ThemeMode; icon: React.ReactNode; label: string }[] = [
    { id: "light", icon: <Sun size={14} />, label: "Light" },
    { id: "dark", icon: <Moon size={14} />, label: "Dark" },
    { id: "system", icon: <Monitor size={14} />, label: "System" },
  ];

  return (
    <div className="flex items-center gap-1 bg-secondary rounded-lg p-0.5">
      {modes.map((mode) => (
        <button
          key={mode.id}
          onClick={() => onChange(mode.id)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-colors ${
            value === mode.id
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {mode.icon}
          {mode.label}
        </button>
      ))}
    </div>
  );
}

export function AccentPicker({
  value,
  onChange,
}: {
  value: AccentColor;
  onChange: (accent: AccentColor) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      {ACCENT_COLORS.map((color) => (
        <button
          key={color.id}
          onClick={() => onChange(color.id)}
          title={color.label}
          className={`w-6 h-6 rounded-full flex items-center justify-center transition-transform ${
            color.swatch
          } ${value === color.id ? "ring-2 ring-foreground/30 ring-offset-2 ring-offset-background scale-110" : "hover:scale-110"}`}
        >
          {value === color.id && (
            <Check size={12} className="text-white drop-shadow-sm" />
          )}
        </button>
      ))}
    </div>
  );
}
