import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { load } from "@tauri-apps/plugin-store";
import { openUrl } from "@tauri-apps/plugin-opener";
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import {
  Mic,
  Keyboard,
  ClipboardPaste,
  Info,
  Settings as SettingsIcon,
  Shield,
  Sun,
  Moon,
  Monitor,
  Check,

  RefreshCw,
  Download,
  Clock,
  Palette,
  Layers,
  Box,
  Trash2,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import History from "@/components/History";

type PermissionStatus = "granted" | "denied" | "unknown" | "checking";
type Section = "general" | "appearance" | "permissions" | "recording" | "output" | "history" | "model" | "updates" | "about";
type ThemeMode = "light" | "dark" | "system";
type AccentColor = "zinc" | "orange" | "teal" | "green" | "blue" | "purple" | "red";
type StartSound = "chirp" | "ping" | "blip" | "none";
type OverlayTheme = "default" | "minimal" | "glass" | "compact";
type OverlayPosition =
  | "top-left" | "top-center" | "top-right"
  | "center-left" | "center" | "center-right"
  | "bottom-left" | "bottom-center" | "bottom-right";

interface ModelInfo {
  ready: boolean;
  path: string;
  size_bytes: number;
  name: string;
  version: string;
  quantization: string;
}

interface DownloadProgress {
  file: string;
  progress: number;
  downloaded?: number;
  total?: number;
}

const OVERLAY_THEMES: { id: OverlayTheme; label: string; desc: string }[] = [
  { id: "default", label: "Default", desc: "Waveform + controls" },
  { id: "minimal", label: "Minimal", desc: "Pill with timer" },
  { id: "glass", label: "Glass", desc: "Frosted blur" },

  { id: "compact", label: "Compact", desc: "Timer only" },
];

const OVERLAY_POSITIONS: OverlayPosition[] = [
  "top-left", "top-center", "top-right",
  "center-left", "center", "center-right",
  "bottom-left", "bottom-center", "bottom-right",
];

const START_SOUNDS: { id: StartSound; label: string }[] = [
  { id: "chirp", label: "Chirp" },
  { id: "ping", label: "Ping" },
  { id: "blip", label: "Blip" },
  { id: "none", label: "None" },
];

const ACCENT_PRESETS: Record<AccentColor, { light: string; dark: string }> = {
  zinc:   { light: "oklch(0.205 0 0)",     dark: "oklch(0.75 0.01 75)" },
  orange: { light: "oklch(0.58 0.19 55)",  dark: "oklch(0.75 0.16 55)" },
  teal:   { light: "oklch(0.52 0.14 180)", dark: "oklch(0.72 0.14 180)" },
  green:  { light: "oklch(0.52 0.16 150)", dark: "oklch(0.72 0.17 150)" },
  blue:   { light: "oklch(0.50 0.18 250)", dark: "oklch(0.70 0.17 250)" },
  purple: { light: "oklch(0.50 0.20 300)", dark: "oklch(0.70 0.19 300)" },
  red:    { light: "oklch(0.55 0.22 25)",  dark: "oklch(0.70 0.19 25)" },
};

const ACCENT_COLORS: { id: AccentColor; label: string; swatch: string }[] = [
  { id: "zinc", label: "Zinc", swatch: "bg-zinc-600 dark:bg-zinc-400" },
  { id: "orange", label: "Orange", swatch: "bg-orange-500" },
  { id: "teal", label: "Teal", swatch: "bg-teal-500" },
  { id: "green", label: "Green", swatch: "bg-emerald-500" },
  { id: "blue", label: "Blue", swatch: "bg-blue-500" },
  { id: "purple", label: "Purple", swatch: "bg-purple-500" },
  { id: "red", label: "Red", swatch: "bg-red-500" },
];

// --- Theme helpers ---

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  if (mode === "dark") {
    root.classList.add("dark");
  } else if (mode === "light") {
    root.classList.remove("dark");
  } else {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.classList.toggle("dark", prefersDark);
  }
  // Re-apply accent when theme changes (light/dark use different values)
  const accent = (localStorage.getItem("accentColor") || "zinc") as AccentColor;
  applyAccentVars(accent);
}

function applyAccentVars(accent: AccentColor) {
  const root = document.documentElement;
  const isDark = root.classList.contains("dark");
  const preset = ACCENT_PRESETS[accent];
  const color = isDark ? preset.dark : preset.light;
  const vars = ["--primary", "--ring", "--sidebar-primary", "--sidebar-ring"];
  vars.forEach((v) => root.style.setProperty(v, color));
}

function applyAccent(accent: AccentColor) {
  applyAccentVars(accent);
}

// --- Utility functions ---

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
  } else if (key.length === 1) {
    normalizedKey = key.toUpperCase();
  }

  parts.push(normalizedKey);
  return parts.join("+");
}

function shortcutToDisplay(shortcut: string): string {
  return shortcut
    .replace("CmdOrCtrl", "\u2318")
    .replace("Cmd", "\u2318")
    .replace("Ctrl", "\u2303")
    .replace("Shift", "\u21E7")
    .replace("Alt", "\u2325")
    .replace("Space", "Space")
    .replace(/\+/g, " ");
}

// --- Sub-components ---

function HotkeyRecorder({
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

function SettingRow({
  label,
  description,
  note,
  children,
}: {
  label: string;
  description?: string;
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

function PermissionIndicator({
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

function SectionCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
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

function NavItem({
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

function ThemePicker({
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

function AccentPicker({
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

// --- Main Settings ---

export default function Settings() {
  const [activeSection, setActiveSection] = useState<Section>("general");
  const [devices, setDevices] = useState<string[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [hotkey, setHotkey] = useState<string>("");
  const [pasteMode, setPasteMode] = useState<"auto" | "clipboard">("auto");
  const [micPermission, setMicPermission] =
    useState<PermissionStatus>("checking");
  const [a11yPermission, setA11yPermission] =
    useState<PermissionStatus>("checking");
  const [autostart, setAutostart] = useState(false);
  const [showInDock, setShowInDock] = useState(true);
  const [startSound, setStartSound] = useState<StartSound>("chirp");
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [lastChecked, setLastChecked] = useState<string>("");
  const [updateStatus, setUpdateStatus] = useState<"idle" | "checking" | "available" | "downloading" | "up-to-date">("idle");
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const [accentColor, setAccentColor] = useState<AccentColor>("zinc");
  const [overlayPosition, setOverlayPosition] = useState<OverlayPosition>("center");
  const [overlayTheme, setOverlayTheme] = useState<OverlayTheme>("default");
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [modelActionLoading, setModelActionLoading] = useState(false);

  useEffect(() => {
    invoke<string[]>("get_input_devices").then((devs) => {
      setDevices(devs);
      if (devs.length > 0 && !selectedDevice) {
        setSelectedDevice(devs[0]);
      }
    });
    invoke<string>("get_current_hotkey").then(setHotkey);
    invoke<ModelInfo>("get_model_status").then(setModelInfo);
    checkPermissions();
    loadAppSettings();
  }, []);

  // Restore saved window position/size and save on close
  // Save window position/size on move/resize (restored in Rust on create)
  useEffect(() => {
    const win = getCurrentWebviewWindow();
    let timer: ReturnType<typeof setTimeout>;
    const saveGeometry = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        try {
          const pos = await win.outerPosition();
          const size = await win.outerSize();
          const factor = await win.scaleFactor();
          const store = await load("settings.json");
          await store.set("settingsGeometry", {
            x: pos.x / factor,
            y: pos.y / factor,
            w: size.width / factor,
            h: size.height / factor,
          });
        } catch {}
      }, 500);
    };

    const u1 = win.onMoved(saveGeometry);
    const u2 = win.onResized(saveGeometry);
    return () => {
      clearTimeout(timer);
      u1.then((fn) => fn());
      u2.then((fn) => fn());
    };
  }, []);

  // Recheck permissions when window regains focus (e.g. returning from System Settings)
  useEffect(() => {
    const win = getCurrentWebviewWindow();
    const unlisten = win.onFocusChanged(({ payload: focused }) => {
      if (focused) checkPermissions();
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  // Listen for model download progress events
  useEffect(() => {
    const unlisten = listen<DownloadProgress>("model-download-progress", (event) => {
      const data = event.payload;
      if (data.file === "complete") {
        setDownloadProgress(null);
        setModelActionLoading(false);
        // Refresh model info after download completes
        invoke<ModelInfo>("get_model_status").then(setModelInfo);
      } else {
        setDownloadProgress(data);
      }
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  // Listen for system theme changes when in "system" mode
  useEffect(() => {
    if (themeMode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [themeMode]);

  const loadAppSettings = async () => {
    try {
      const store = await load("settings.json");
      const savedTheme = await store.get<ThemeMode>("themeMode");
      const savedAccent = await store.get<AccentColor>("accentColor");

      if (savedTheme) {
        setThemeMode(savedTheme);
        applyTheme(savedTheme);
        localStorage.setItem("themeMode", savedTheme);
      } else {
        applyTheme("system");
      }

      const accent = savedAccent || "zinc";
      setAccentColor(accent);
      applyAccent(accent);
      localStorage.setItem("accentColor", accent);

      const autostartEnabled = await isEnabled();
      setAutostart(autostartEnabled);

      const savedDock = await store.get<boolean>("showInDock");
      if (savedDock !== null && savedDock !== undefined) {
        setShowInDock(savedDock);
      }

      const savedSound = await store.get<StartSound>("startSound");
      if (savedSound) {
        setStartSound(savedSound);
        localStorage.setItem("startSound", savedSound);
      }

      const savedOverlayPos = await store.get<OverlayPosition>("overlayPosition");
      if (savedOverlayPos) {
        setOverlayPosition(savedOverlayPos);
        localStorage.setItem("overlayPosition", savedOverlayPos);
      }

      const savedOverlayTheme = await store.get<OverlayTheme>("overlayTheme");
      if (savedOverlayTheme) {
        setOverlayTheme(savedOverlayTheme);
        localStorage.setItem("overlayTheme", savedOverlayTheme);
      }


      const savedAutoUpdate = await store.get<boolean>("autoUpdate");
      if (savedAutoUpdate !== null && savedAutoUpdate !== undefined) {
        setAutoUpdate(savedAutoUpdate);
      }
      const savedLastChecked = await store.get<string>("lastChecked");
      if (savedLastChecked) {
        setLastChecked(savedLastChecked);
      }
    } catch (e) {
      console.error("Failed to load settings:", e);
      applyTheme("system");
    }
  };

  const checkPermissions = async () => {
    setMicPermission("checking");
    setA11yPermission("checking");
    const mic = await invoke<string>("check_microphone_permission");
    setMicPermission(mic === "granted" ? "granted" : "denied");
    const a11y = await invoke<string>("check_accessibility_permission");
    setA11yPermission(a11y === "granted" ? "granted" : "denied");
  };

  const openSettings = (pane: string) => {
    invoke("open_privacy_settings", { pane });
  };

  const handleHotkeyChange = async (shortcut: string) => {
    try {
      await invoke("set_hotkey", { shortcut });
      setHotkey(shortcut);
    } catch (e) {
      console.error("Failed to set hotkey:", e);
    }
  };

  const handleAutostartChange = async (enabled: boolean) => {
    try {
      if (enabled) {
        await enable();
      } else {
        await disable();
      }
      setAutostart(enabled);
    } catch (e) {
      console.error("Failed to toggle autostart:", e);
    }
  };

  const handleDockChange = async (visible: boolean) => {
    try {
      await invoke("set_dock_visible", { visible });
      setShowInDock(visible);
      const store = await load("settings.json");
      await store.set("showInDock", visible);
    } catch (e) {
      console.error("Failed to toggle dock visibility:", e);
    }
  };

  const handleStartSoundChange = async (sound: StartSound) => {
    setStartSound(sound);
    localStorage.setItem("startSound", sound);
    if (sound !== "none") {
      new Audio(`/sounds/${sound}.mp3`).play().catch(() => {});
    }
    try {
      const store = await load("settings.json");
      await store.set("startSound", sound);
    } catch (e) {
      console.error("Failed to save start sound:", e);
    }
  };


  const handleOverlayPositionChange = async (pos: OverlayPosition) => {
    setOverlayPosition(pos);
    localStorage.setItem("overlayPosition", pos);
    try {
      const store = await load("settings.json");
      await store.set("overlayPosition", pos);
    } catch (e) {
      console.error("Failed to save overlay position:", e);
    }
  };

  const handleOverlayThemeChange = async (theme: OverlayTheme) => {
    setOverlayTheme(theme);
    localStorage.setItem("overlayTheme", theme);
    try {
      const store = await load("settings.json");
      await store.set("overlayTheme", theme);
    } catch (e) {
      console.error("Failed to save overlay theme:", e);
    }
  };


  const handleDownloadModel = async () => {
    setModelActionLoading(true);
    try {
      // Delete existing model first so progress card shows cleanly
      await invoke("delete_model");
      const info = await invoke<ModelInfo>("get_model_status");
      setModelInfo(info);
      await invoke("download_model");
    } catch (e) {
      console.error("Failed to download model:", e);
      setModelActionLoading(false);
      setDownloadProgress(null);
    }
  };

  const handleDeleteModel = async () => {
    setModelActionLoading(true);
    try {
      await invoke("delete_model");
      const info = await invoke<ModelInfo>("get_model_status");
      setModelInfo(info);
    } catch (e) {
      console.error("Failed to delete model:", e);
    }
    setModelActionLoading(false);
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(i > 1 ? 1 : 0)} ${units[i]}`;
  };

  const handleAutoUpdateChange = async (enabled: boolean) => {
    setAutoUpdate(enabled);
    try {
      const store = await load("settings.json");
      await store.set("autoUpdate", enabled);
    } catch (e) {
      console.error("Failed to save auto-update:", e);
    }
  };

  const checkForUpdates = async () => {
    setUpdateStatus("checking");
    try {
      const update = await check();
      const now = new Date().toLocaleString("en-US", {
        month: "short", day: "numeric", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      });
      setLastChecked(now);
      const store = await load("settings.json");
      await store.set("lastChecked", now);

      if (update) {
        setUpdateStatus("available");
        if (confirm(`Update ${update.version} is available. Download and install?`)) {
          setUpdateStatus("downloading");
          await update.downloadAndInstall();
          await relaunch();
        } else {
          setUpdateStatus("idle");
        }
      } else {
        setUpdateStatus("up-to-date");
        setTimeout(() => setUpdateStatus("idle"), 3000);
      }
    } catch (e) {
      console.error("Update check failed:", e);
      setUpdateStatus("idle");
    }
  };

  const handleThemeChange = async (mode: ThemeMode) => {
    setThemeMode(mode);
    applyTheme(mode);
    localStorage.setItem("themeMode", mode);

    try {
      const store = await load("settings.json");
      await store.set("themeMode", mode);
    } catch (e) {
      console.error("Failed to save theme:", e);
    }
  };

  const handleAccentChange = async (accent: AccentColor) => {
    setAccentColor(accent);
    applyAccent(accent);
    localStorage.setItem("accentColor", accent);

    try {
      const store = await load("settings.json");
      await store.set("accentColor", accent);
    } catch (e) {
      console.error("Failed to save accent:", e);
    }
  };

  const navItems: { id: Section; label: string; icon: React.ReactNode }[] = [
    { id: "general", label: "General", icon: <SettingsIcon size={16} /> },
    { id: "appearance", label: "Appearance", icon: <Palette size={16} /> },
    { id: "permissions", label: "Permissions", icon: <Shield size={16} /> },
    { id: "recording", label: "Recording", icon: <Mic size={16} /> },
    { id: "output", label: "Output", icon: <ClipboardPaste size={16} /> },
    { id: "history", label: "History", icon: <Clock size={16} /> },
    { id: "model", label: "Model", icon: <Box size={16} /> },
    { id: "updates", label: "Updates", icon: <Download size={16} /> },
    { id: "about", label: "About", icon: <Info size={16} /> },
  ];

  return (
    <div className="h-full flex overflow-hidden bg-background">
      {/* Sidebar */}
      <div className="w-48 shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col">
        <div
          className="h-8 shrink-0"
          data-tauri-drag-region
        />
        <div className="px-3 mb-3">
          <h1 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-3">
            Settings
          </h1>
        </div>
        <nav className="flex-1 px-3 space-y-0.5">
          {navItems.map((item) => (
            <NavItem
              key={item.id}
              icon={item.icon}
              label={item.label}
              active={activeSection === item.id}
              onClick={() => setActiveSection(item.id)}
            />
          ))}
        </nav>
        {downloadProgress && (
          <div className="px-3 pb-2">
            <div className="px-3 py-2 rounded-lg bg-sidebar-accent/50">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Download size={12} className="text-primary animate-pulse shrink-0" />
                <span className="text-[11px] text-foreground truncate">
                  Downloading... {downloadProgress.progress}%
                </span>
              </div>
              <div className="h-1 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${downloadProgress.progress}%` }}
                />
              </div>
            </div>
          </div>
        )}
        <div className="px-3 pb-3">
          <p className="text-[11px] text-muted-foreground/50 px-3">
            AudioShift v0.1.0
          </p>
        </div>
      </div>

      {/* Content */}
      {activeSection === "history" ? (
        <div className="flex-1 flex flex-col min-h-0">
          <div
            className="h-8 shrink-0"
            data-tauri-drag-region
          />
          <div className="flex-1 min-h-0 overflow-hidden">
            <History />
          </div>
        </div>
      ) : (
      <ScrollArea className="flex-1">
        <div
          className="h-8 shrink-0"
          data-tauri-drag-region
        />
        <div className="p-6">
          {activeSection === "general" && (
            <div className="space-y-4">
              <SectionCard title="Startup & Dock" icon={<SettingsIcon size={14} />}>
                <SettingRow
                  label="Launch at startup"
                  description="Automatically start AudioShift when you log in"
                >
                  <Switch
                    checked={autostart}
                    onCheckedChange={handleAutostartChange}
                  />
                </SettingRow>
                <Separator />
                <SettingRow
                  label="Show in Dock"
                  description="Display AudioShift icon in the Dock"
                  note="Note: May require app restart to take effect."
                >
                  <Switch
                    checked={showInDock}
                    onCheckedChange={handleDockChange}
                  />
                </SettingRow>
              </SectionCard>

              <SectionCard title="Sound" icon={<Mic size={14} />}>
                <SettingRow
                  label="Start Sound"
                  description="Choose which sound plays when recording starts"
                >
                  <Select
                    value={startSound}
                    onValueChange={(v) => handleStartSoundChange(v as StartSound)}
                  >
                    <SelectTrigger className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {START_SOUNDS.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </SettingRow>
              </SectionCard>
            </div>
          )}

          {activeSection === "appearance" && (
            <div className="space-y-4">
              <SectionCard title="Theme" icon={<Sun size={14} />}>
                <SettingRow
                  label="Theme"
                  description="Choose light, dark, or match your system"
                >
                  <ThemePicker value={themeMode} onChange={handleThemeChange} />
                </SettingRow>
                <Separator />
                <SettingRow
                  label="Accent Color"
                  description="Pick a preset accent color for the app"
                >
                  <AccentPicker value={accentColor} onChange={handleAccentChange} />
                </SettingRow>
              </SectionCard>

              <SectionCard title="Overlay" icon={<Layers size={14} />}>
                <SettingRow
                  label="Overlay Theme"
                  description="Visual style for the recording overlay"
                >
                  <div className="flex items-center gap-1 bg-secondary rounded-lg p-0.5">
                    {OVERLAY_THEMES.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => handleOverlayThemeChange(t.id)}
                        title={t.desc}
                        className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
                          overlayTheme === t.id
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </SettingRow>
                <Separator />
                <SettingRow
                  label="Screen Position"
                  description="Where the recording overlay appears"
                >
                  <div className="grid grid-cols-3 gap-1 w-[72px]">
                    {OVERLAY_POSITIONS.map((pos) => (
                      <button
                        key={pos}
                        onClick={() => handleOverlayPositionChange(pos)}
                        title={pos.replace("-", " ")}
                        className={`w-5 h-5 rounded-sm flex items-center justify-center transition-colors ${
                          overlayPosition === pos
                            ? "bg-primary"
                            : "bg-secondary hover:bg-accent border border-border"
                        }`}
                      >
                        <span
                          className={`block w-1.5 h-1.5 rounded-full ${
                            overlayPosition === pos
                              ? "bg-primary-foreground"
                              : "bg-muted-foreground/50"
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                </SettingRow>
              </SectionCard>
            </div>
          )}

          {activeSection === "updates" && (
            <div className="space-y-4">
              <SectionCard title="Automatic Updates" icon={<Download size={14} />}>
                <SettingRow
                  label="Automatic Updates"
                  description="Check for updates automatically once per hour"
                  note={lastChecked ? `Last checked: ${lastChecked}` : undefined}
                >
                  <Switch
                    checked={autoUpdate}
                    onCheckedChange={handleAutoUpdateChange}
                  />
                </SettingRow>
                <div className="flex items-center gap-2 py-3">
                  <button
                    onClick={checkForUpdates}
                    disabled={updateStatus === "checking" || updateStatus === "downloading"}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md
                               bg-primary text-primary-foreground hover:bg-primary/90
                               transition-colors disabled:opacity-50"
                  >
                    {updateStatus === "checking" ? (
                      <RefreshCw size={12} className="animate-spin" />
                    ) : updateStatus === "downloading" ? (
                      <Download size={12} className="animate-pulse" />
                    ) : (
                      <RefreshCw size={12} />
                    )}
                    {updateStatus === "checking" ? "Checking..." :
                     updateStatus === "downloading" ? "Installing..." :
                     updateStatus === "up-to-date" ? "Up to date" :
                     "Check for Updates"}
                  </button>
                </div>
              </SectionCard>
            </div>
          )}

          {activeSection === "model" && modelInfo && (
            <div className="space-y-4">
              <SectionCard title="Speech Model" icon={<Box size={14} />}>
                <SettingRow label="Model" description="Local transcription engine">
                  <span className="text-sm text-muted-foreground font-mono">
                    {modelInfo.name} {modelInfo.version}
                  </span>
                </SettingRow>
                <Separator />
                <SettingRow label="Quantization" description="Model precision format">
                  <span className="text-sm text-muted-foreground font-mono">
                    {modelInfo.quantization}
                  </span>
                </SettingRow>
                <Separator />
                <SettingRow label="Status" description="Whether model files are downloaded">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${modelInfo.ready ? "bg-emerald-500" : "bg-amber-500"}`} />
                    <span className="text-sm text-muted-foreground">
                      {modelInfo.ready ? "Ready" : "Not downloaded"}
                    </span>
                  </div>
                </SettingRow>
                {modelInfo.ready && (
                  <>
                    <Separator />
                    <SettingRow label="Storage" description={modelInfo.path}>
                      <span className="text-sm text-muted-foreground font-mono">
                        {formatBytes(modelInfo.size_bytes)}
                      </span>
                    </SettingRow>
                  </>
                )}
              </SectionCard>

              {downloadProgress && (
                <SectionCard title="Download Progress" icon={<Download size={14} />}>
                  <div className="py-3 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground truncate mr-2">{downloadProgress.file}</span>
                      <span className="text-foreground font-mono shrink-0">{downloadProgress.progress}%</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-300"
                        style={{ width: `${downloadProgress.progress}%` }}
                      />
                    </div>
                    {downloadProgress.downloaded != null && downloadProgress.total != null && (
                      <div className="text-[11px] text-muted-foreground">
                        {formatBytes(downloadProgress.downloaded)} / {formatBytes(downloadProgress.total)}
                      </div>
                    )}
                  </div>
                </SectionCard>
              )}

              <SectionCard title="Actions" icon={<SettingsIcon size={14} />}>
                <div className="flex items-center gap-2 py-3">
                  <button
                    onClick={handleDownloadModel}
                    disabled={modelActionLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md
                               bg-primary text-primary-foreground hover:bg-primary/90
                               transition-colors disabled:opacity-50"
                  >
                    {modelActionLoading && downloadProgress ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Download size={12} />
                    )}
                    {modelInfo.ready ? "Re-download Model" : "Download Model"}
                  </button>
                  {modelInfo.ready && (
                    <button
                      onClick={handleDeleteModel}
                      disabled={modelActionLoading}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md
                                 bg-secondary border border-border text-muted-foreground
                                 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30
                                 transition-colors disabled:opacity-50"
                    >
                      <Trash2 size={12} />
                      Delete Model
                    </button>
                  )}
                </div>
              </SectionCard>
            </div>
          )}

          {activeSection === "permissions" && (
            <div className="space-y-4">
              <SectionCard title="Permissions" icon={<Shield size={14} />}>
                <PermissionIndicator
                  label="Microphone"
                  status={micPermission}
                  onOpen={() => openSettings("microphone")}
                />
                <Separator />
                <PermissionIndicator
                  label="Accessibility"
                  status={a11yPermission}
                  onOpen={() => openSettings("accessibility")}
                />
                <div className="py-2">
                  <button
                    onClick={checkPermissions}
                    className="text-xs text-primary hover:text-primary/80 transition-colors"
                  >
                    Recheck permissions
                  </button>
                </div>
              </SectionCard>
            </div>
          )}

          {activeSection === "recording" && (
            <div className="space-y-4">
              <SectionCard title="Hotkey" icon={<Keyboard size={14} />}>
                <SettingRow
                  label="Record Shortcut"
                  description="Press to start recording, press again to stop"
                >
                  {hotkey && (
                    <HotkeyRecorder
                      value={hotkey}
                      onChange={handleHotkeyChange}
                    />
                  )}
                </SettingRow>
              </SectionCard>

              <SectionCard title="Input" icon={<Mic size={14} />}>
                <SettingRow
                  label="Input Device"
                  description="Microphone used for voice recording"
                >
                  <Select
                    value={selectedDevice}
                    onValueChange={setSelectedDevice}
                  >
                    <SelectTrigger className="w-72">
                      <SelectValue placeholder="Select device" />
                    </SelectTrigger>
                    <SelectContent>
                      {devices.map((d) => (
                        <SelectItem key={d} value={d}>
                          {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </SettingRow>
              </SectionCard>

            </div>
          )}

          {activeSection === "output" && (
            <div className="space-y-4">
              <SectionCard
                title="Paste Behavior"
                icon={<ClipboardPaste size={14} />}
              >
                <SettingRow
                  label="Auto-paste"
                  description="Automatically paste transcribed text into the active app"
                  note={
                    pasteMode === "auto"
                      ? "Copies text and simulates \u2318V"
                      : "You paste manually with \u2318V"
                  }
                >
                  <Switch
                    checked={pasteMode === "auto"}
                    onCheckedChange={(checked) =>
                      setPasteMode(checked ? "auto" : "clipboard")
                    }
                  />
                </SettingRow>
              </SectionCard>
            </div>
          )}

          {activeSection === "about" && (
            <div className="space-y-4">
              <SectionCard title="About AudioShift" icon={<Info size={14} />}>
                <SettingRow label="Version" description="Current app version">
                  <span className="text-sm text-muted-foreground font-mono">
                    0.1.0
                  </span>
                </SettingRow>
                <Separator />
                <SettingRow
                  label="Speech Model"
                  description="Local transcription engine"
                >
                  <span className="text-sm text-muted-foreground font-mono">
                    Parakeet TDT v3
                  </span>
                </SettingRow>
                <Separator />
                <SettingRow label="Website">
                  <button
                    onClick={() => openUrl("https://audioshift.io")}
                    className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors"
                  >
                    audioshift.io
                    <ExternalLink size={12} />
                  </button>
                </SettingRow>
                <Separator />
                <SettingRow label="Source Code">
                  <button
                    onClick={() => openUrl("https://github.com/aarsla/audioshift")}
                    className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors"
                  >
                    GitHub
                    <ExternalLink size={12} />
                  </button>
                </SettingRow>
              </SectionCard>

              <SectionCard title="Setup" icon={<SettingsIcon size={14} />}>
                <SettingRow
                  label="Onboarding"
                  description="Run the initial setup wizard again"
                >
                  <button
                    onClick={async () => {
                      const { load } = await import("@tauri-apps/plugin-store");
                      const store = await load("settings.json");
                      await store.delete("onboardingCompleted");
                      invoke("show_onboarding");
                    }}
                    className="px-2.5 py-1 text-xs rounded-md bg-secondary border border-border
                               hover:bg-accent text-muted-foreground transition-colors"
                  >
                    Redo Setup
                  </button>
                </SettingRow>
              </SectionCard>
              <p className="text-[11px] text-muted-foreground/50 text-center">
                &copy; 2026 AudioShift
              </p>
            </div>
          )}
        </div>
      </ScrollArea>
      )}
    </div>
  );
}
