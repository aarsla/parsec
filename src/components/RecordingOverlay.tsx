import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { availableMonitors, cursorPosition } from "@tauri-apps/api/window";
import Waveform from "./Waveform";

type OverlayPosition =
  | "top-left" | "top-center" | "top-right"
  | "center-left" | "center" | "center-right"
  | "bottom-left" | "bottom-center" | "bottom-right";

const OVERLAY_W = 320;
const OVERLAY_H = 120;
const MARGIN = 20;

interface WorkArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function positionOverlay(win: ReturnType<typeof getCurrentWebviewWindow>) {
  const pos = (localStorage.getItem("overlayPosition") || "center") as OverlayPosition;
  try {
    // Try native work area (excludes dock/menu bar on macOS)
    const workArea = await invoke<WorkArea | null>("get_work_area_at_cursor");

    let mx: number, my: number, mw: number, mh: number;

    if (workArea) {
      // CG returns logical coordinates directly
      mx = workArea.x;
      my = workArea.y;
      mw = workArea.width;
      mh = workArea.height;
    } else {
      // Fallback: full monitor bounds
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
      x = mx + mw - OVERLAY_W - MARGIN;
    } else {
      x = mx + (mw - OVERLAY_W) / 2;
    }

    // Vertical
    if (pos.startsWith("top")) {
      y = my + MARGIN;
    } else if (pos.startsWith("bottom")) {
      y = my + mh - OVERLAY_H - MARGIN;
    } else {
      y = my + (mh - OVERLAY_H) / 2;
    }

    await win.setPosition(new LogicalPosition(x, y));
  } catch (e) {
    console.error("Failed to position overlay:", e);
  }
}

interface Props {
  status: string;
}

export default function RecordingOverlay({ status }: Props) {
  const [amplitudes, setAmplitudes] = useState<number[]>([]);
  const [seconds, setSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const win = getCurrentWebviewWindow();

    if (status === "recording") {
      positionOverlay(win).then(() => win.show());
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
  }, [status]);

  useEffect(() => {
    if (status !== "recording") return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleCancel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [status]);

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

  const handleStop = async () => {
    try {
      await invoke("stop_recording");
    } catch (e) {
      console.error("Stop failed:", e);
    }
  };

  const handleCancel = async () => {
    try {
      await invoke("cancel_recording");
    } catch (e) {
      console.error("Cancel failed:", e);
    }
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  if (status === "transcribing") {
    return (
      <div className="flex items-center justify-center h-full bg-zinc-900/90 rounded-3xl px-6 select-none"
           data-tauri-drag-region>
        <div className="flex items-center gap-3 text-zinc-300 text-sm">
          <div className="w-4 h-4 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
          Transcribing...
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-zinc-900/90 rounded-3xl px-4 py-3 select-none"
         data-tauri-drag-region>
      <div className="flex-1 flex items-center">
        <Waveform amplitudes={amplitudes} />
      </div>
      <div className="flex items-center justify-between text-xs text-zinc-400">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-zinc-300 font-mono">{formatTime(seconds)}</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleCancel}
            className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleStop}
            className="px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
