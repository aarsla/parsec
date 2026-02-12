import { Box, Download, Loader2, Trash2, Settings as SettingsIcon } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { SectionCard, SettingRow, formatBytes, type ModelInfo, type DownloadProgress } from "./shared";

interface Props {
  modelInfo: ModelInfo;
  downloadProgress: DownloadProgress | null;
  modelActionLoading: boolean;
  onDownloadModel: () => void;
  onDeleteModel: () => void;
}

export default function ModelPage({
  modelInfo, downloadProgress, modelActionLoading,
  onDownloadModel, onDeleteModel,
}: Props) {
  return (
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
            onClick={onDownloadModel}
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
              onClick={onDeleteModel}
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
  );
}
