import { Download, RefreshCw, Check, Loader2 } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { SectionCard, SettingRow, formatBytes, type UpdateStatus } from "./shared";

interface Props {
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

export default function UpdatesPage({
  autoUpdate, lastChecked, updateStatus, updateError,
  updateVersion, updateBody, updateDownloaded, updateTotal,
  onAutoUpdateChange, onCheckForUpdates, onInstallUpdate, onRestart,
}: Props) {
  return (
    <div className="space-y-4">
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
    </div>
  );
}
