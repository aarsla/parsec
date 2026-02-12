import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { load } from "@tauri-apps/plugin-store";
import RecordingOverlay from "./components/RecordingOverlay";
import Settings from "./components/Settings";
import Onboarding from "./components/Onboarding";

type Route = "overlay" | "settings" | "onboarding" | "empty";

function getRoute(): Route {
  const path = window.location.pathname;
  if (path === "/overlay") return "overlay";
  if (path === "/settings") return "settings";
  if (path === "/onboarding") return "onboarding";
  return "empty";
}

const ACCENT_PRESETS: Record<string, { light: string; dark: string }> = {
  zinc:   { light: "oklch(0.205 0 0)",     dark: "oklch(0.75 0.01 75)" },
  orange: { light: "oklch(0.58 0.19 55)",  dark: "oklch(0.75 0.16 55)" },
  teal:   { light: "oklch(0.52 0.14 180)", dark: "oklch(0.72 0.14 180)" },
  green:  { light: "oklch(0.52 0.16 150)", dark: "oklch(0.72 0.17 150)" },
  blue:   { light: "oklch(0.50 0.18 250)", dark: "oklch(0.70 0.17 250)" },
  purple: { light: "oklch(0.50 0.20 300)", dark: "oklch(0.70 0.19 300)" },
  red:    { light: "oklch(0.55 0.22 25)",  dark: "oklch(0.70 0.19 25)" },
};

function applyAccentVars(accent: string, isDark: boolean) {
  const preset = ACCENT_PRESETS[accent] || ACCENT_PRESETS.zinc;
  const color = isDark ? preset.dark : preset.light;
  const root = document.documentElement;
  ["--primary", "--ring", "--sidebar-primary", "--sidebar-ring"].forEach((v) =>
    root.style.setProperty(v, color)
  );
}

// Apply saved theme and accent on any window load
async function initTheme() {
  try {
    const store = await load("settings.json");
    const mode = await store.get<string>("themeMode");
    const accent = await store.get<string>("accentColor") || "orange";

    const root = document.documentElement;
    let isDark: boolean;
    if (mode === "dark") {
      root.classList.add("dark");
      isDark = true;
    } else if (mode === "light") {
      root.classList.remove("dark");
      isDark = false;
    } else {
      isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      root.classList.toggle("dark", isDark);
    }

    applyAccentVars(accent, isDark);
  } catch {
    // Store not available yet, fall back to system
    const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.classList.toggle("dark", isDark);
    applyAccentVars("orange", isDark);
  }
}

export default function App() {
  const route = getRoute();
  const [status, setStatus] = useState<string>("idle");

  useEffect(() => {
    initTheme();
  }, []);

  useEffect(() => {
    const unlisten = listen<string>("status-changed", (event) => {
      setStatus(event.payload);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    if (route !== "overlay") return;

    const unlistenToggle = listen<string>("recording-toggle", async (event) => {
      if (event.payload === "start") {
        try {
          const sound = localStorage.getItem("startSound") || "chirp";
          if (sound !== "none") {
            new Audio(`/sounds/${sound}.mp3`).play().catch(() => {});
          }
          await invoke("start_recording");
        } catch (e) {
          console.error("Failed to start recording:", e);
        }
      } else if (event.payload === "stop") {
        try {
          const store = await load("settings.json");
          const pasteMode = await store.get<string>("pasteMode") ?? "auto";
          await invoke("stop_recording", { autoPaste: pasteMode === "auto" });
        } catch (e) {
          console.error("Failed to stop recording:", e);
        }
      }
    });

    return () => {
      unlistenToggle.then((fn) => fn());
    };
  }, [route]);

  switch (route) {
    case "overlay":
      return <RecordingOverlay status={status} />;
    case "settings":
      return <Settings />;
    case "onboarding":
      return <Onboarding />;
    default:
      return null;
  }
}
