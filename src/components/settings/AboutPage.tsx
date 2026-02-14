import { invoke } from "@tauri-apps/api/core";
import { load } from "@tauri-apps/plugin-store";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Info, Settings as SettingsIcon, ExternalLink, Download, RefreshCw, Check, Loader2 } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { SectionCard, SettingRow, formatBytes, type UpdateStatus } from "./shared";

interface Props {
  liveModelName: string;
  liveModelSize: string;
  isMas: boolean;
  autoUpdate: boolean;
  lastChecked: string;
  updateStatus: UpdateStatus;
  updateError: string;
  updateVersion: string;
  updateBody: string;
  updateDownloaded: number;
  updateTotal: number;
  onAutoUpdateChange: (enabled: boolean) => void;
  onCheckForUpdates: () => void;
  onInstallUpdate: () => void;
  onRestart: () => void;
}

export default function AboutPage({
  liveModelName, liveModelSize, isMas,
  autoUpdate, lastChecked, updateStatus, updateError,
  updateVersion, updateBody, updateDownloaded, updateTotal,
  onAutoUpdateChange, onCheckForUpdates, onInstallUpdate, onRestart,
}: Props) {
  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-xl overflow-hidden px-4 py-4 flex items-center gap-5">
        <img src="/icon.png" alt="AudioShift" className="w-16 h-16 rounded-xl shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-primary mb-1">
            Your own, private voice-to-text
          </p>
          <h3 className="text-xl font-bold text-foreground leading-tight">
            Stop typing.{" "}
            <span className="text-primary">Start speaking.</span>
          </h3>
          <p className="text-[11px] text-muted-foreground/60 mt-1 font-mono">v1.0.1</p>
        </div>
        <div className="shrink-0 flex items-center pr-2">
          <div className="flex items-center gap-[3px] h-12">
            {Array.from({ length: 24 }).map((_, i) => {
              const h = 6 + (((i * 7 + 13) * 37) % 36);
              const delay = (((i * 11 + 5) * 23) % 120) / 100;
              const dur = 0.8 + (((i * 13 + 3) * 29) % 80) / 100;
              return (
                <div
                  key={i}
                  className="w-[3px] rounded-full bg-primary"
                  style={{
                    height: `${h}px`,
                    animation: `about-wave ${dur}s ease-in-out ${delay}s infinite`,
                    opacity: 0.5,
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>
      <style>{`
        @keyframes about-wave {
          0%, 100% { transform: scaleY(0.3); opacity: 0.3; }
          50% { transform: scaleY(1); opacity: 0.7; }
        }
      `}</style>
      <SectionCard title="About AudioShift" icon={<Info size={14} />}>
        <SettingRow label="Version" description="Current app version">
          <span className="text-sm text-muted-foreground font-mono">
            v1.0.1
          </span>
        </SettingRow>
        <Separator />
        <SettingRow label="Speech Model" description="Local transcription engine">
          <div className="text-right">
            <span className="text-sm text-muted-foreground font-mono">{liveModelName}</span>
            {liveModelSize && (
              <div className="text-[11px] text-muted-foreground/60 font-mono">{liveModelSize}</div>
            )}
          </div>
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

      {!isMas && (
        <>
          <SectionCard title="Updates" icon={<Download size={14} />}>
            <SettingRow
              label="Automatic Updates"
              description="Check for updates automatically in the background"
            >
              <Switch checked={autoUpdate} onCheckedChange={onAutoUpdateChange} />
            </SettingRow>
            <Separator />
            <div className="px-4 py-3 space-y-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={onCheckForUpdates}
                  disabled={updateStatus === "checking" || updateStatus === "downloading"}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md
                             bg-primary text-primary-foreground hover:bg-primary/90
                             transition-colors disabled:opacity-50"
                >
                  {updateStatus === "checking" ? (
                    <RefreshCw size={12} className="animate-spin" />
                  ) : (
                    <RefreshCw size={12} />
                  )}
                  {updateStatus === "checking" ? "Checking..." : "Check for Updates"}
                </button>
              </div>
              {updateStatus === "up-to-date" && (
                <p className="text-xs text-muted-foreground">
                  You're on the latest version.{lastChecked && ` Last checked: ${lastChecked}`}
                </p>
              )}
              {updateStatus === "error" && updateError && (
                <p className="text-xs text-destructive/80">
                  {updateError}
                </p>
              )}
              {updateStatus === "idle" && lastChecked && (
                <p className="text-xs text-muted-foreground">
                  Last checked: {lastChecked}
                </p>
              )}
            </div>
          </SectionCard>

          {updateStatus === "available" && updateVersion && (
            <SectionCard title="Update Available" icon={<Download size={14} />}>
              <div className="px-4 py-3 space-y-3">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Version {updateVersion} is available
                  </p>
                  {updateBody && (
                    <p className="text-xs text-muted-foreground mt-1 whitespace-pre-line">
                      {updateBody}
                    </p>
                  )}
                </div>
                <button
                  onClick={onInstallUpdate}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md
                             bg-primary text-primary-foreground hover:bg-primary/90
                             transition-colors"
                >
                  <Download size={12} />
                  Install & Restart
                </button>
              </div>
            </SectionCard>
          )}

          {updateStatus === "downloading" && (
            <SectionCard title="Installing Update" icon={<Download size={14} />}>
              <div className="px-4 py-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin text-primary" />
                  <span className="text-sm text-foreground">Downloading update...</span>
                </div>
                {updateTotal > 0 && (
                  <>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-300"
                        style={{ width: `${Math.round((updateDownloaded / updateTotal) * 100)}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {formatBytes(updateDownloaded)} / {formatBytes(updateTotal)}
                    </p>
                  </>
                )}
              </div>
            </SectionCard>
          )}

          {updateStatus === "restart-pending" && (
            <SectionCard title="Update Ready" icon={<Check size={14} />}>
              <div className="px-4 py-3 space-y-3">
                <p className="text-sm text-foreground">
                  Update has been downloaded and installed. Restart to apply.
                </p>
                <button
                  onClick={onRestart}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md
                             bg-primary text-primary-foreground hover:bg-primary/90
                             transition-colors"
                >
                  <RefreshCw size={12} />
                  Restart Now
                </button>
              </div>
            </SectionCard>
          )}
        </>
      )}

      <SectionCard title="Setup" icon={<SettingsIcon size={14} />}>
        <SettingRow
          label="Onboarding"
          description="Run the initial setup wizard again"
        >
          <button
            onClick={async () => {
              const store = await load("settings.json");
              await store.delete("onboardingCompleted");
              await store.delete("liveModel");
              invoke("restart_app");
            }}
            className="px-2.5 py-1 text-xs rounded-md bg-secondary border border-border
                       hover:bg-accent text-muted-foreground transition-colors"
          >
            Restart Onboarding
          </button>
        </SettingRow>
      </SectionCard>
      <p className="text-[11px] text-muted-foreground/50 text-center">
        &copy; 2026 AudioShift
      </p>
    </div>
  );
}
