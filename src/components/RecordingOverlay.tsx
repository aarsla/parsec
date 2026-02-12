import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import { availableMonitors, cursorPosition } from "@tauri-apps/api/window";
import { load } from "@tauri-apps/plugin-store";
import Waveform from "./Waveform";

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

export type OverlayTheme = "default" | "minimal" | "glass" | "compact";

type OverlayPosition =
  | "top-left" | "top-center" | "top-right"
  | "center-left" | "center" | "center-right"
  | "bottom-left" | "bottom-center" | "bottom-right";

const MARGIN = 20;

interface ThemeConfig {
  w: number;
  h: number;
  showWaveform: boolean;
  containerClass: string;
  waveformColor: string;
}

const THEME_CONFIGS: Record<OverlayTheme, ThemeConfig> = {
  default: {
    w: 320, h: 96,
    showWaveform: true,
    containerClass: "bg-background/90 rounded-3xl",
    waveformColor: "",
  },
  minimal: {
    w: 320, h: 44,
    showWaveform: false,
    containerClass: "bg-background/90 rounded-full",
    waveformColor: "",
  },
  glass: {
    w: 320, h: 96,
    showWaveform: true,
    containerClass: "bg-white/10 backdrop-blur-2xl border border-white/20 rounded-3xl",
    waveformColor: "255, 255, 255",
  },
  compact: {
    w: 110, h: 36,
    showWaveform: false,
    containerClass: "bg-background/90 rounded-full",
    waveformColor: "",
  },
};

interface WorkArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function positionOverlay(
  win: ReturnType<typeof getCurrentWebviewWindow>,
  w: number,
  h: number,
) {
  const pos = (localStorage.getItem("overlayPosition") || "center") as OverlayPosition;
  try {
    await win.setSize(new LogicalSize(w, h));

    const workArea = await invoke<WorkArea | null>("get_work_area_at_cursor");

    let mx: number, my: number, mw: number, mh: number;

    if (workArea) {
      mx = workArea.x;
      my = workArea.y;
      mw = workArea.width;
      mh = workArea.height;
    } else {
      const cursor = await cursorPosition();
      const monitors = await availableMonitors();
      const monitor = monitors.find((m) => {
        const { x, y } = m.position;
        const { width, height } = m.size;
        return cursor.x >= x && cursor.x < x + width && cursor.y >= y && cursor.y < y + height;
      }) ?? monitors[0];

      if (!monitor) return;

      mx = monitor.position.x / monitor.scaleFactor;
      my = monitor.position.y / monitor.scaleFactor;
      mw = monitor.size.width / monitor.scaleFactor;
      mh = monitor.size.height / monitor.scaleFactor;
    }

    let x: number;
    let y: number;

    // Horizontal
    if (pos.includes("left")) {
      x = mx + MARGIN;
    } else if (pos.includes("right")) {
      x = mx + mw - w - MARGIN;
    } else {
      x = mx + (mw - w) / 2;
    }

    // Vertical
    if (pos.startsWith("top")) {
      y = my + MARGIN;
    } else if (pos.startsWith("bottom")) {
      y = my + mh - h - MARGIN;
    } else {
      y = my + (mh - h) / 2;
    }

    await win.setPosition(new LogicalPosition(x, y));
  } catch (e) {
    console.error("Failed to position overlay:", e);
  }
}

const ACCENT_RGB: Record<string, string> = {
  zinc:   "161, 161, 170",
  orange: "234, 136, 0",
  teal:   "0, 172, 172",
  green:  "0, 172, 105",
  blue:   "59, 130, 246",
  purple: "147, 81, 255",
  red:    "225, 72, 59",
};


interface Props {
  status: string;
}

export default function RecordingOverlay({ status }: Props) {
  const [amplitudes, setAmplitudes] = useState<number[]>([]);
  const [seconds, setSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [theme, setTheme] = useState<OverlayTheme>(
    () => (localStorage.getItem("overlayTheme") || "default") as OverlayTheme
  );
  const [accentKey, setAccentKey] = useState(() => localStorage.getItem("accentColor") || "blue");
  const isMac = navigator.userAgent.includes("Mac");
  const [hotkey, setHotkey] = useState(isMac ? "Alt+Space" : "Ctrl+Space");
  // Sync settings cross-window via tauri store onKeyChange
  useEffect(() => {
    let cleanups: (() => void)[] = [];
    invoke<string>("get_current_hotkey").then(setHotkey).catch(() => {});
    load("settings.json").then(async (store) => {
      const u1 = await store.onKeyChange<string>("overlayTheme", (v) => {
        if (v) setTheme(v as OverlayTheme);
      });
      const u2 = await store.onKeyChange<string>("accentColor", (v) => {
        if (v) setAccentKey(v);
      });
      const u3 = await store.onKeyChange<string>("themeMode", (v) => {
        const root = document.documentElement;
        if (v === "dark") root.classList.add("dark");
        else if (v === "light") root.classList.remove("dark");
        else root.classList.toggle("dark", window.matchMedia("(prefers-color-scheme: dark)").matches);
      });
      const u4 = await store.onKeyChange<string>("hotkey", (v) => {
        if (v) setHotkey(v);
      });
      cleanups = [u1, u2, u3, u4];
    });
    return () => { cleanups.forEach((fn) => fn()); };
  }, []);

  const config = THEME_CONFIGS[theme];
  const waveformColor = config.waveformColor || (ACCENT_RGB[accentKey] || ACCENT_RGB.blue);

  // Transparent background so rounded corners show through, hide scrollbars
  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.documentElement.style.overflow = "hidden";
    document.body.style.background = "transparent";
    document.body.style.overflow = "hidden";
  }, []);

  useEffect(() => {
    const win = getCurrentWebviewWindow();

    if (status === "recording") {
      positionOverlay(win, config.w, config.h).then(() => win.show());
      setSeconds(0);
      setAmplitudes([]);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } else if (status === "transcribing") {
      // Keep visible but stop timer
      if (timerRef.current) clearInterval(timerRef.current);
    } else {
      win.hide();
      if (timerRef.current) clearInterval(timerRef.current);
      setSeconds(0);
      setAmplitudes([]);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [status, theme]);

  useEffect(() => {
    const unlisten = listen<number>("audio-amplitude", (event) => {
      setAmplitudes((prev) => {
        const next = [...prev, event.payload];
        return next.length > 60 ? next.slice(-60) : next;
      });
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  if (status === "transcribing") {
    const isSmall = theme === "compact" || theme === "minimal";
    return (
      <div
        className={`flex items-center justify-center h-full px-4 select-none ${config.containerClass}`}

        data-tauri-drag-region
      >
        <div className={`flex items-center gap-2 text-foreground ${isSmall ? "text-xs" : "text-sm"}`}>
          <div className={`${isSmall ? "w-3 h-3" : "w-4 h-4"} border-2 border-muted-foreground border-t-transparent rounded-full animate-spin`} />
          {!isSmall && "Transcribing..."}
        </div>
      </div>
    );
  }

  // Compact: red dot + timer only, no buttons
  if (theme === "compact") {
    return (
      <div
        className={`flex items-center justify-center gap-2 h-full px-4 select-none ${config.containerClass}`}
        data-tauri-drag-region
      >
        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        <span className="text-foreground font-mono text-xs">{formatTime(seconds)}</span>
      </div>
    );
  }

  // Minimal: red dot + timer + hotkey hint, pill shape
  if (theme === "minimal") {
    return (
      <div
        className={`flex items-center h-full px-4 gap-3 select-none ${config.containerClass}`}
        data-tauri-drag-region
      >
        <div className="flex items-center gap-2 shrink-0">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-foreground font-mono text-xs">{formatTime(seconds)}</span>
        </div>
        <span className="text-muted-foreground text-[10px] shrink-0 ml-auto">
          {shortcutToDisplay(hotkey)} to finish · Esc to cancel
        </span>
      </div>
    );
  }

  // Default / Glass: full layout with waveform + timer + hotkey hints
  return (
    <div
      className={`flex flex-col h-full px-4 py-3 select-none ${config.containerClass}`}
      data-tauri-drag-region
    >
      <div className="flex-1 flex items-center">
        <Waveform amplitudes={amplitudes} barColor={waveformColor} />
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-foreground font-mono">{formatTime(seconds)}</span>
        </div>
        <span className="text-[11px]">
          {shortcutToDisplay(hotkey)} to finish · Esc to cancel
        </span>
      </div>
    </div>
  );
}
