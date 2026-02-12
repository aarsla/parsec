import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  AudioWaveform,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Keyboard,
  Loader2,
  Mic,
  TriangleAlert,
} from "lucide-react";

interface OnboardingStatus {
  model_ready: boolean;
  mic_granted: boolean;
  accessibility_granted: boolean;
}

interface DownloadProgress {
  file: string;
  progress: number;
  downloaded?: number;
  total?: number;
  overall_downloaded?: number;
  overall_total?: number;
  overall_progress?: number;
}

const STEPS = ["Welcome", "Model", "Microphone", "Accessibility", "Ready"] as const;

function formatMB(bytes: number): string {
  return Math.round(bytes / (1024 * 1024)).toString();
}

function shortcutDisplay(shortcut: string): string {
  return shortcut
    .replace("CmdOrCtrl", "\u2318")
    .replace("Cmd", "\u2318")
    .replace("Ctrl", "\u2303")
    .replace("Shift", "\u21E7")
    .replace("Alt", "\u2325")
    .replace("Space", "Space")
    .replace(/\+/g, "");
}

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState<OnboardingStatus>({
    model_ready: false,
    mic_granted: false,
    accessibility_granted: false,
  });
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [hotkey, setHotkey] = useState("CmdOrCtrl+Shift+Space");
  const [testState, setTestState] = useState<"idle" | "recording" | "transcribing">("idle");
  const [testResult, setTestResult] = useState("");
  const downloadStarted = useRef(false);

  // 1. Listen for download progress — set up FIRST so no events are missed
  useEffect(() => {
    const unlisten = listen<DownloadProgress>("model-download-progress", (event) => {
      const data = event.payload;
      if (data.file === "complete") {
        setProgress(null);
        setDownloadError(null);
        setStatus((s) => ({ ...s, model_ready: true }));
      } else {
        setProgress(data);
      }
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  // 2. Check status, then start download from HERE (not from Rust setup)
  useEffect(() => {
    const init = async () => {
      const [s, hk] = await Promise.all([
        invoke<OnboardingStatus>("check_onboarding_needed"),
        invoke<string>("get_current_hotkey"),
      ]);
      setStatus(s);
      setHotkey(hk);

      if (!s.model_ready && !downloadStarted.current) {
        downloadStarted.current = true;
        // Delete any partial/stale files so nothing gets skipped
        try { await invoke("delete_model"); } catch {}
        // Show immediate feedback
        setProgress({ file: "starting", progress: 0, overall_progress: 0, overall_downloaded: 0, overall_total: 680_000_000 });
        // Start download — listener above is already active
        try {
          await invoke("download_model");
        } catch (e) {
          setDownloadError(String(e));
          setProgress(null);
        }
      }
    };
    init();
  }, []);

  // Recheck status when window regains focus (e.g. returning from System Settings)
  useEffect(() => {
    const win = getCurrentWebviewWindow();
    const unlisten = win.onFocusChanged(({ payload: focused }) => {
      if (focused) {
        invoke<OnboardingStatus>("check_onboarding_needed").then(setStatus);
      }
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  // 3. Poll status on active steps as backup
  useEffect(() => {
    if (step < 1) return;
    const interval = setInterval(async () => {
      const s = await invoke<OnboardingStatus>("check_onboarding_needed");
      setStatus(s);
    }, 1000);
    return () => clearInterval(interval);
  }, [step]);

  const retryDownload = async () => {
    setDownloadError(null);
    try { await invoke("delete_model"); } catch {}
    setProgress({ file: "starting", progress: 0, overall_progress: 0, overall_downloaded: 0, overall_total: 680_000_000 });
    try {
      await invoke("download_model");
    } catch (e) {
      setDownloadError(String(e));
      setProgress(null);
    }
  };

  // Listen for status changes on the Ready step to track test recording
  useEffect(() => {
    if (step !== 4) return;
    const unlisten = listen<string>("status-changed", (event) => {
      const s = event.payload;
      if (s === "recording") setTestState("recording");
      else if (s === "transcribing") setTestState("transcribing");
      else if (s === "idle" && (testState === "recording" || testState === "transcribing")) {
        setTestState("idle");
        // Fetch the latest transcription from history
        invoke<Array<{ text: string }>>("get_history").then((entries) => {
          if (entries.length > 0) setTestResult(entries[0].text);
        });
      }
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [step, testState]);

  const startTestRecording = async () => {
    setTestResult("");
    try {
      await invoke("start_recording");
      setTestState("recording");
    } catch (e) {
      setTestResult(`Error: ${e}`);
    }
  };

  const closeWindow = () => {
    invoke("complete_onboarding").finally(() => {
      getCurrentWebviewWindow().close();
    });
  };

  const canGoNext = () => {
    switch (step) {
      case 1: return true;
      default: return true;
    }
  };

  const overallPct = progress?.overall_progress ?? 0;
  const overallDl = progress?.overall_downloaded ?? 0;
  const overallTotal = progress?.overall_total ?? 680_000_000;
  const currentFile = progress?.file && progress.file !== "starting" ? progress.file : null;

  return (
    <div className="h-screen flex flex-col bg-background text-foreground select-none overflow-hidden">
      {/* Drag region */}
      <div className="h-8 shrink-0" data-tauri-drag-region />

      {/* Content */}
      <div className="flex-1 flex flex-col px-10 pb-6 min-h-0">
        {/* Step content */}
        <div className="flex-1 flex flex-col justify-center min-h-0">
          {step === 0 && (
            <div className="space-y-4 text-center">
              <div className="flex justify-center">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <AudioWaveform size={32} className="text-primary" />
                </div>
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Welcome to AudioShift</h1>
                <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">
                  Local voice-to-text transcription. Press a shortcut, speak, and your words appear as text — all processed on your device.
                </p>
              </div>
              <p className="text-xs text-muted-foreground/70">
                Let's get you set up in a few quick steps.
              </p>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Download size={20} className="text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Speech Model</h2>
                  <p className="text-xs text-muted-foreground">
                    Parakeet TDT 0.6b v3 (~630 MB) for local transcription.
                  </p>
                </div>
              </div>

              {status.model_ready ? (
                <div className="flex items-center gap-2.5 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <Check size={18} className="text-emerald-500 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Parakeet TDT downloaded</p>
                    <p className="text-xs text-muted-foreground">Ready for transcription.</p>
                  </div>
                </div>
              ) : downloadError ? (
                <div className="space-y-3 p-4 rounded-xl bg-destructive/5 border border-destructive/20">
                  <div className="flex items-center gap-2 text-sm">
                    <TriangleAlert size={14} className="text-destructive shrink-0" />
                    <span className="text-foreground font-medium">Download failed</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{downloadError}</p>
                  <button
                    onClick={retryDownload}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg
                               bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    <Download size={14} />
                    Retry Download
                  </button>
                </div>
              ) : (
                <div className="space-y-3 p-4 rounded-xl bg-card border border-border">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <Loader2 size={14} className="animate-spin text-primary" />
                      Downloading{currentFile ? ` ${currentFile}` : ""}...
                    </span>
                    <span className="font-mono text-foreground">{overallPct}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-300"
                      style={{ width: `${Math.max(overallPct, 1)}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {formatMB(overallDl)} / ~{formatMB(overallTotal)} MB
                  </p>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Mic size={20} className="text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Microphone Access</h2>
                  <p className="text-xs text-muted-foreground">
                    AudioShift needs microphone access to capture your voice.
                  </p>
                </div>
              </div>

              {status.mic_granted ? (
                <div className="flex items-center gap-2.5 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <Check size={18} className="text-emerald-500 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Microphone access granted</p>
                    <p className="text-xs text-muted-foreground">You're all set.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="p-4 rounded-xl bg-card border border-border">
                    <p className="text-sm text-muted-foreground mb-3">
                      Click the button below to grant microphone access.
                    </p>
                    <button
                      onClick={() => invoke("request_microphone_permission")}
                      className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg
                                 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                    >
                      <Mic size={14} />
                      Grant Microphone Access
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Keyboard size={20} className="text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Accessibility Access</h2>
                  <p className="text-xs text-muted-foreground">
                    Required to paste transcribed text into other apps.
                  </p>
                </div>
              </div>

              {status.accessibility_granted ? (
                <div className="flex items-center gap-2.5 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <Check size={18} className="text-emerald-500 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Accessibility access granted</p>
                    <p className="text-xs text-muted-foreground">You're all set.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="p-4 rounded-xl bg-card border border-border">
                    <p className="text-sm text-muted-foreground mb-3">
                      Click the button below to grant accessibility access. You may need to toggle AudioShift in System Settings.
                    </p>
                    <button
                      onClick={() => invoke("request_accessibility_permission")}
                      className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg
                                 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                    >
                      <Keyboard size={14} />
                      Grant Accessibility Access
                    </button>
                  </div>
                  <p className="text-[11px] text-muted-foreground/70">
                    This page will update automatically once access is granted.
                  </p>
                </div>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4 text-center">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">You're all set!</h2>
                <p className="text-sm text-muted-foreground mt-2">
                  Try it out — click the button below and say something.
                </p>
              </div>

              <div className="space-y-3 max-w-xs mx-auto">
                {testState === "idle" && !testResult && (
                  <button
                    onClick={startTestRecording}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-sm rounded-lg
                               bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    <Mic size={16} /> Try It
                  </button>
                )}

                {testState === "recording" && (
                  <div className="flex items-center justify-center gap-2 px-5 py-2.5 text-sm text-red-500">
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    Listening... press <kbd className="px-1.5 py-0.5 rounded bg-muted font-mono text-xs text-foreground">{shortcutDisplay(hotkey)}</kbd> to stop
                  </div>
                )}

                {testState === "transcribing" && (
                  <div className="flex items-center justify-center gap-2 px-5 py-2.5 text-sm text-muted-foreground">
                    <Loader2 size={16} className="animate-spin" /> Transcribing...
                  </div>
                )}

                {testResult && (
                  <div className="p-3 rounded-xl bg-card border border-border text-left">
                    <p className="text-sm text-foreground">{testResult}</p>
                  </div>
                )}
              </div>

              <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-card border border-border mx-auto">
                <span className="text-xs text-muted-foreground">Press</span>
                <kbd className="px-2.5 py-1 rounded-md bg-muted text-sm font-mono font-medium text-foreground">
                  {shortcutDisplay(hotkey)}
                </kbd>
                <span className="text-xs text-muted-foreground">anywhere to record</span>
              </div>

              <div className="space-y-1.5 text-left max-w-xs mx-auto">
                <StatusRow label="Speech Model" ok={status.model_ready} />
                <StatusRow label="Microphone" ok={status.mic_granted} />
                <StatusRow label="Accessibility" ok={status.accessibility_granted} />
              </div>

              <div className="pt-1">
                <button
                  onClick={closeWindow}
                  className="inline-flex items-center gap-1.5 px-6 py-2.5 text-sm rounded-lg
                             bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Start Using AudioShift
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="shrink-0 pt-4">
          {/* Step dots (hidden on last screen) */}
          {step < 4 && (
            <div className="flex justify-center gap-1.5 mb-4">
              {STEPS.map((_, i) => (
                <div
                  key={i}
                  className={`w-1.5 h-1.5 rounded-full transition-colors ${
                    i === step ? "bg-primary" : i < step ? "bg-primary/40" : "bg-muted-foreground/20"
                  }`}
                />
              ))}
            </div>
          )}

          {/* Buttons */}
          <div className="flex items-center justify-between">
            <div>
              {step > 0 && step < 4 && (
                <button
                  onClick={() => setStep(step - 1)}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg
                             text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ChevronLeft size={14} />
                  Back
                </button>
              )}
            </div>

            <div>
              {step === 0 && (
                <button
                  onClick={() => setStep(1)}
                  className="flex items-center gap-1.5 px-5 py-2 text-sm rounded-lg
                             bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Get Started
                  <ChevronRight size={14} />
                </button>
              )}

              {step > 0 && step < 4 && (
                <div className="flex items-center gap-2">
                  {/* Skip for model/permission steps */}
                  {(step >= 1 && step <= 3) && (
                    <button
                      onClick={() => setStep(step + 1)}
                      className="px-3 py-1.5 text-sm rounded-lg
                                 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Skip
                    </button>
                  )}
                  <button
                    onClick={() => setStep(step + 1)}
                    disabled={!canGoNext()}
                    className="flex items-center gap-1.5 px-5 py-2 text-sm rounded-lg
                               bg-primary text-primary-foreground hover:bg-primary/90
                               transition-colors disabled:opacity-40 disabled:pointer-events-none"
                  >
                    Next
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <div className={`w-2 h-2 rounded-full shrink-0 ${ok ? "bg-emerald-500" : "bg-amber-500"}`} />
      <span className="text-sm text-foreground">{label}</span>
      <span className="text-xs text-muted-foreground ml-auto">
        {ok ? "Ready" : "Not set up"}
      </span>
    </div>
  );
}
