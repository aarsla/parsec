import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import Waveform from "./Waveform";

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
      win.show();
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
      <div className="flex items-center justify-center h-full bg-zinc-900/90 rounded-2xl px-6 select-none"
           data-tauri-drag-region>
        <div className="flex items-center gap-3 text-zinc-300 text-sm">
          <div className="w-4 h-4 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
          Transcribing...
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-zinc-900/90 rounded-2xl px-4 py-3 select-none"
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
            Done ⌘⇧Space
          </button>
        </div>
      </div>
    </div>
  );
}
