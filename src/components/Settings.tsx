import React, { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { load } from "@tauri-apps/plugin-store";
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";
import {
  Mic, ClipboardPaste, Info,
  Settings as SettingsIcon, Shield, Palette,
  Clock, Download, Box,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import History from "@/components/History";
import {
  NavItem, applyTheme, applyAccent,
  type Section, type ThemeMode, type AccentColor, type StartSound,
  type OverlayTheme, type OverlayPosition, type PermissionStatus,
  type ModelStatusEntry, type DownloadProgress, type UpdateStatus,
} from "./settings/shared";
import GeneralPage from "./settings/GeneralPage";
import AppearancePage from "./settings/AppearancePage";
import PermissionsPage from "./settings/PermissionsPage";
import RecordingPage from "./settings/RecordingPage";
import OutputPage from "./settings/OutputPage";
import ModelPage from "./settings/ModelPage";
import AboutPage from "./settings/AboutPage";
import UpdatesPage from "./settings/UpdatesPage";
export default function Settings() {
  const [activeSection, setActiveSection] = useState<Section>("general");
  const [devices, setDevices] = useState<string[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [hotkey, setHotkey] = useState<string>("");
  const [pasteMode, setPasteMode] = useState<"auto" | "clipboard">("auto");
  const [micPermission, setMicPermission] = useState<PermissionStatus>("checking");
  const [a11yPermission, setA11yPermission] = useState<PermissionStatus>("checking");
  const [autostart, setAutostart] = useState(false);
  const [showInDock, setShowInDock] = useState(true);
  const [startSound, setStartSound] = useState<StartSound>("none");
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [lastChecked, setLastChecked] = useState<string>("");
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>("idle");
  const [updateError, setUpdateError] = useState("");
  const [updateVersion, setUpdateVersion] = useState("");
  const [updateBody, setUpdateBody] = useState("");
  const [updateDownloaded, setUpdateDownloaded] = useState(0);
  const [updateTotal, setUpdateTotal] = useState(0);
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const [accentColor, setAccentColor] = useState<AccentColor>("orange");
  const [overlayPosition, setOverlayPosition] = useState<OverlayPosition>("top-center");
  const [overlayTheme, setOverlayTheme] = useState<OverlayTheme>("default");
  const [testingMic, setTestingMic] = useState(false);
  const [models, setModels] = useState<ModelStatusEntry[]>([]);
  const [liveModel, setLiveModel] = useState("parakeet-tdt-0.6b-v3");
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [downloadingModelId, setDownloadingModelId] = useState<string | null>(null);
  const [modelPreloading, setModelPreloading] = useState(false);
  const [transcriptionLanguage, setTranscriptionLanguage] = useState("auto");
  const [translateToEnglish, setTranslateToEnglish] = useState(false);
  const [monitorLevel, setMonitorLevel] = useState(0);
  const [saveHistory, setSaveHistory] = useState(true);
  const [buildVariant, setBuildVariant] = useState<"direct" | "mas">("direct");
  const monitorSmoothed = useRef(0);
  const monitorRaf = useRef(0);

  // --- Effects ---

  useEffect(() => {
    invoke<string[]>("get_input_devices").then(async (devs) => {
      setDevices(devs);
      try {
        const store = await load("settings.json");
        const saved = await store.get<string>("inputDevice");
        if (saved && (saved === "default" || devs.includes(saved))) {
          setSelectedDevice(saved);
        } else {
          setSelectedDevice("default");
        }
      } catch {
        setSelectedDevice("default");
      }
    });
    invoke<string>("get_current_hotkey").then(setHotkey);
    invoke<string>("get_build_variant").then((v) => setBuildVariant(v as "direct" | "mas"));
    invoke<ModelStatusEntry[]>("get_all_models_status").then(setModels);
    invoke<string>("get_live_model").then(setLiveModel);
    invoke<string>("get_transcription_language").then(setTranscriptionLanguage);
    invoke<boolean>("get_translate_to_english").then(setTranslateToEnglish);
    checkPermissions();
    loadAppSettings();

    // Check for pending section navigation (from tray "Check for Updates...")
    load("settings.json").then(async (store) => {
      const pending = await store.get<string>("pendingSection");
      if (pending) {
        setActiveSection(pending as Section);
        await store.delete("pendingSection");
      }
    }).catch(() => {});
  }, []);

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

  useEffect(() => {
    const win = getCurrentWebviewWindow();
    const unlisten = win.onFocusChanged(({ payload: focused }) => {
      if (focused) {
        checkPermissions();
        invoke<string[]>("get_input_devices").then((devs) => {
          setDevices(devs);
          // If selected device was unplugged, reset to default
          if (selectedDevice !== "default" && !devs.includes(selectedDevice)) {
            setSelectedDevice("default");
          }
        });
      }
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [selectedDevice]);

  useEffect(() => {
    const unlisten = listen<string>("live-model-changed", (event) => {
      setLiveModel(event.payload);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  useEffect(() => {
    const u1 = listen("model-preload-start", () => setModelPreloading(true));
    const u2 = listen("model-preload-done", () => setModelPreloading(false));
    return () => { u1.then((fn) => fn()); u2.then((fn) => fn()); };
  }, []);

  useEffect(() => {
    const unlisten = listen<DownloadProgress>("model-download-progress", (event) => {
      const data = event.payload;
      if (data.file === "complete") {
        setDownloadProgress(null);
        setDownloadingModelId(null);
        invoke<ModelStatusEntry[]>("get_all_models_status").then(setModels);
      } else {
        setDownloadProgress(data);
      }
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  useEffect(() => {
    if (!testingMic || !selectedDevice) return;
    let cancelled = false;
    monitorSmoothed.current = 0;
    setMonitorLevel(0);

    invoke("start_monitor", { device: selectedDevice === "default" ? null : selectedDevice }).catch((e) =>
      console.error("start_monitor failed:", e)
    );

    const unlisten = listen<number>("monitor-amplitude", (event) => {
      const raw = Math.min(event.payload * 50, 1);
      monitorSmoothed.current += (raw - monitorSmoothed.current) * 0.3;
      if (!monitorRaf.current && !cancelled) {
        monitorRaf.current = requestAnimationFrame(() => {
          monitorRaf.current = 0;
          if (!cancelled) setMonitorLevel(monitorSmoothed.current);
        });
      }
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(monitorRaf.current);
      monitorRaf.current = 0;
      invoke("stop_monitor");
      unlisten.then((fn) => fn());
      setMonitorLevel(0);
    };
  }, [testingMic, selectedDevice]);

  useEffect(() => {
    if (themeMode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [themeMode]);

  useEffect(() => {
    const unlisten = listen<string>("navigate-section", (event) => {
      const section = event.payload as Section;
      setActiveSection(section);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  useEffect(() => {
    const unlistenStatus = listen<{status: string; version?: string; body?: string; error?: string}>("update-status", (event) => {
      const { status, version, body, error } = event.payload;
      setUpdateStatus(status as UpdateStatus);
      if (version) setUpdateVersion(version);
      if (body !== undefined) setUpdateBody(body || "");
      if (error) setUpdateError(error);
      else if (status !== "error") setUpdateError("");

      if (status === "available" || status === "up-to-date" || status === "error") {
        const now = new Date().toLocaleString("en-US", {
          month: "short", day: "numeric", year: "numeric",
          hour: "2-digit", minute: "2-digit",
        });
        setLastChecked(now);
        load("settings.json").then(store => store.set("lastChecked", now)).catch(() => {});
      }
    });

    const unlistenProgress = listen<{downloaded: number; total: number | null}>("update-download-progress", (event) => {
      setUpdateDownloaded(event.payload.downloaded);
      if (event.payload.total) setUpdateTotal(event.payload.total);
    });

    return () => {
      unlistenStatus.then(fn => fn());
      unlistenProgress.then(fn => fn());
    };
  }, []);

  // --- Loaders ---

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

      const accent = savedAccent || "orange";
      setAccentColor(accent);
      applyAccent(accent);
      localStorage.setItem("accentColor", accent);

      try {
        if (buildVariant === "mas") {
          const enabled = await invoke<boolean>("mas_login_item_is_enabled");
          setAutostart(enabled);
        } else {
          const autostartEnabled = await isEnabled();
          setAutostart(autostartEnabled);
        }
      } catch {
        // autostart not available
      }

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

      const savedPasteMode = await store.get<"auto" | "clipboard">("pasteMode");
      if (savedPasteMode) {
        setPasteMode(savedPasteMode);
      }

      const savedLanguage = await store.get<string>("transcriptionLanguage");
      if (savedLanguage) setTranscriptionLanguage(savedLanguage);
      const savedTranslate = await store.get<boolean>("translateToEnglish");
      if (savedTranslate !== null && savedTranslate !== undefined) setTranslateToEnglish(savedTranslate);

      const savedSaveHistory = await store.get<boolean>("saveHistory");
      if (savedSaveHistory !== null && savedSaveHistory !== undefined) {
        setSaveHistory(savedSaveHistory);
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

  // --- Handlers ---

  const handleHotkeyChange = async (shortcut: string) => {
    try {
      await invoke("set_hotkey", { shortcut });
      setHotkey(shortcut);
      const store = await load("settings.json");
      await store.set("hotkey", shortcut);
    } catch (e) {
      console.error("Failed to set hotkey:", e);
    }
  };

  const handleAutostartChange = async (enabled: boolean) => {
    try {
      if (buildVariant === "mas") {
        if (enabled) await invoke("mas_login_item_enable");
        else await invoke("mas_login_item_disable");
      } else {
        if (enabled) await enable(); else await disable();
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

  const handleDeviceChange = async (device: string) => {
    setSelectedDevice(device);
    setTestingMic(false);
    try {
      const store = await load("settings.json");
      await store.set("inputDevice", device);
    } catch (e) {
      console.error("Failed to save input device:", e);
    }
  };

  const handlePasteModeChange = async (mode: "auto" | "clipboard") => {
    setPasteMode(mode);
    try {
      const store = await load("settings.json");
      await store.set("pasteMode", mode);
    } catch (e) {
      console.error("Failed to save paste mode:", e);
    }
  };

  const handleDownloadModel = async (modelId: string) => {
    setDownloadingModelId(modelId);
    try {
      await invoke("delete_model", { modelId });
      setModels(await invoke<ModelStatusEntry[]>("get_all_models_status"));
      await invoke("download_model", { modelId });
    } catch (e) {
      console.error("Failed to download model:", e);
      setDownloadingModelId(null);
      setDownloadProgress(null);
    }
  };

  const handleDeleteModel = async (modelId: string) => {
    try {
      await invoke("delete_model", { modelId });
      const updated = await invoke<ModelStatusEntry[]>("get_all_models_status");
      setModels(updated);
      // If deleted model was assigned, reset to first ready model or default
      const firstReady = updated.find((m) => m.ready)?.id || "parakeet-tdt-0.6b-v3";
      if (modelId === liveModel) {
        setLiveModel(firstReady);
        const store = await load("settings.json");
        await store.set("liveModel", firstReady);
      }
    } catch (e) {
      console.error("Failed to delete model:", e);
    }
  };

  const handleLiveModelChange = async (modelId: string) => {
    const prev = liveModel;
    setLiveModel(modelId);
    try {
      await invoke("set_live_model", { modelId });
    } catch (e) {
      console.error("Failed to save live model:", e);
      setLiveModel(prev);
    }
  };

  const handleLanguageChange = async (language: string) => {
    const prev = transcriptionLanguage;
    setTranscriptionLanguage(language);
    try {
      await invoke("set_transcription_language", { language });
    } catch (e) {
      console.error("Failed to save transcription language:", e);
      setTranscriptionLanguage(prev);
    }
  };

  const handleTranslateChange = async (enabled: boolean) => {
    const prev = translateToEnglish;
    setTranslateToEnglish(enabled);
    try {
      await invoke("set_translate_to_english", { enabled });
    } catch (e) {
      console.error("Failed to save translate setting:", e);
      setTranslateToEnglish(prev);
    }
  };

  const handleSaveHistoryChange = async (enabled: boolean) => {
    setSaveHistory(enabled);
    try {
      const store = await load("settings.json");
      await store.set("saveHistory", enabled);
    } catch (e) {
      console.error("Failed to save history setting:", e);
    }
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

  const checkForUpdates = () => {
    invoke("check_for_updates");
  };

  const handleInstallUpdate = () => {
    invoke("install_update").catch((err) => {
      setUpdateStatus("error");
      setUpdateError(String(err));
    });
  };

  const handleRestart = () => {
    invoke("restart_app");
  };

  const openPrivacySettings = (pane: string) => {
    invoke("open_privacy_settings", { pane });
  };

  // --- Navigation ---

  const isMas = buildVariant === "mas";
  const isMac = navigator.userAgent.includes("Mac");

  const navItems: { id: Section; label: string; icon: React.ReactNode }[] = [
    { id: "general", label: "General", icon: <SettingsIcon size={16} /> },
    { id: "recording", label: "Recording", icon: <Mic size={16} /> },
    { id: "model", label: "Transcription", icon: <Box size={16} /> },
    { id: "output", label: "Output", icon: <ClipboardPaste size={16} /> },
    ...(saveHistory ? [{ id: "history" as Section, label: "History", icon: <Clock size={16} /> }] : []),
    { id: "appearance", label: "Appearance", icon: <Palette size={16} /> },
    ...(!isMas ? [{ id: "updates" as Section, label: "Updates", icon: <Download size={16} /> }] : []),
    ...(isMac ? [{ id: "permissions" as Section, label: "Permissions", icon: <Shield size={16} /> }] : []),
    { id: "about", label: "About", icon: <Info size={16} /> },
  ];

  // --- Render active page ---

  const renderPage = () => {
    switch (activeSection) {
      case "general":
        return (
          <GeneralPage
            autostart={autostart}
            showInDock={showInDock}
            startSound={startSound}
            saveHistory={saveHistory}
            isMas={isMas}
            onAutostartChange={handleAutostartChange}
            onDockChange={handleDockChange}
            onStartSoundChange={handleStartSoundChange}
            onSaveHistoryChange={handleSaveHistoryChange}
          />
        );
      case "appearance":
        return (
          <AppearancePage
            themeMode={themeMode}
            accentColor={accentColor}
            overlayPosition={overlayPosition}
            overlayTheme={overlayTheme}
            onThemeChange={handleThemeChange}
            onAccentChange={handleAccentChange}
            onOverlayPositionChange={handleOverlayPositionChange}
            onOverlayThemeChange={handleOverlayThemeChange}
          />
        );
      case "permissions":
        return (
          <PermissionsPage
            micPermission={micPermission}
            a11yPermission={a11yPermission}
            onCheckPermissions={checkPermissions}
            onOpenSettings={openPrivacySettings}
          />
        );
      case "recording":
        return (
          <RecordingPage
            hotkey={hotkey}
            devices={devices}
            selectedDevice={selectedDevice}
            testingMic={testingMic}
            monitorLevel={monitorLevel}
            onHotkeyChange={handleHotkeyChange}
            onDeviceChange={handleDeviceChange}
            onTestingMicChange={setTestingMic}
          />
        );
      case "output":
        return (
          <OutputPage
            pasteMode={pasteMode}
            onPasteModeChange={handlePasteModeChange}
          />
        );
      case "model":
        return (
          <ModelPage
            models={models}
            liveModel={liveModel}
            modelPreloading={modelPreloading}
            downloadProgress={downloadProgress}
            downloadingModelId={downloadingModelId}
            transcriptionLanguage={transcriptionLanguage}
            translateToEnglish={translateToEnglish}
            onDownloadModel={handleDownloadModel}
            onDeleteModel={handleDeleteModel}
            onLiveModelChange={handleLiveModelChange}
            onLanguageChange={handleLanguageChange}
            onTranslateChange={handleTranslateChange}
          />
        );
      case "updates":
        return (
          <UpdatesPage
            autoUpdate={autoUpdate}
            lastChecked={lastChecked}
            updateStatus={updateStatus}
            updateError={updateError}
            updateVersion={updateVersion}
            updateBody={updateBody}
            updateDownloaded={updateDownloaded}
            updateTotal={updateTotal}
            onAutoUpdateChange={handleAutoUpdateChange}
            onCheckForUpdates={checkForUpdates}
            onInstallUpdate={handleInstallUpdate}
            onRestart={handleRestart}
          />
        );
      case "about":
        return (
          <AboutPage
            liveModelName={models.find((m) => m.id === liveModel)?.name ?? liveModel}
            liveModelSize={models.find((m) => m.id === liveModel)?.sizeLabel ?? ""}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="h-full flex overflow-hidden bg-background">
      {/* Sidebar */}
      <div className="w-48 shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col">
        <div className="h-8 shrink-0" data-tauri-drag-region />
        <div className="px-3 mb-3">
          <h1 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-3">
            Settings
          </h1>
        </div>
        <nav className="flex-1 px-3 space-y-0.5">
          {navItems.map((item) => (
            <React.Fragment key={item.id}>
              {(item.id === "updates" || (isMas && item.id === "permissions")) && (
                <div className="!my-2 mx-1 h-px bg-border" />
              )}
            <NavItem
              icon={item.icon}
              label={item.label}
              active={activeSection === item.id}
              onClick={() => { setActiveSection(item.id); setTestingMic(false); }}
            />
            </React.Fragment>
          ))}
        </nav>
        {downloadProgress && downloadingModelId && (
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
            AudioShift v1.0.3
          </p>
        </div>
      </div>

      {/* Content */}
      {activeSection === "history" ? (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="px-6 pt-3 pb-1" data-tauri-drag-region>
            <div className="flex items-center gap-2.5 pt-5 mb-4">
              <span className="text-primary"><Clock size={18} /></span>
              <h2 className="text-xl font-semibold text-foreground">History</h2>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <History />
          </div>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="px-6 pt-3 pb-1" data-tauri-drag-region>
            {(() => {
              const nav = navItems.find((n) => n.id === activeSection);
              return nav ? (
                <div className="flex items-center gap-2.5 pt-5 mb-4">
                  <span className="text-primary [&>svg]:size-[18px]">{nav.icon}</span>
                  <h2 className="text-xl font-semibold text-foreground">{nav.label}</h2>
                </div>
              ) : null;
            })()}
          </div>
          <div className="px-6 pb-6">
            {renderPage()}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
