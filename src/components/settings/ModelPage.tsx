import { Box, Download, Loader2, Trash2, ChevronDown, Languages } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { SectionCard, SettingRow, formatBytes, type ModelStatusEntry, type DownloadProgress } from "./shared";

const LANGUAGES = [
  { value: "auto", label: "Auto-detect" },
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "zh", label: "Chinese" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "pt", label: "Portuguese" },
  { value: "ru", label: "Russian" },
  { value: "ar", label: "Arabic" },
  { value: "hi", label: "Hindi" },
  { value: "it", label: "Italian" },
  { value: "nl", label: "Dutch" },
  { value: "pl", label: "Polish" },
  { value: "tr", label: "Turkish" },
  { value: "sv", label: "Swedish" },
  { value: "da", label: "Danish" },
  { value: "no", label: "Norwegian" },
  { value: "fi", label: "Finnish" },
  { value: "cs", label: "Czech" },
  { value: "el", label: "Greek" },
  { value: "hu", label: "Hungarian" },
  { value: "ro", label: "Romanian" },
  { value: "th", label: "Thai" },
  { value: "vi", label: "Vietnamese" },
  { value: "uk", label: "Ukrainian" },
  { value: "id", label: "Indonesian" },
  { value: "ms", label: "Malay" },
  { value: "he", label: "Hebrew" },
] as const;

interface Props {
  models: ModelStatusEntry[];
  liveModel: string;
  downloadProgress: DownloadProgress | null;
  downloadingModelId: string | null;
  transcriptionLanguage: string;
  translateToEnglish: boolean;
  onDownloadModel: (modelId: string) => void;
  onDeleteModel: (modelId: string) => void;
  onLiveModelChange: (modelId: string) => void;
  onLanguageChange: (language: string) => void;
  onTranslateChange: (enabled: boolean) => void;
}

function EngineBadge({ engine }: { engine: string }) {
  return (
    <span
      className={`px-1.5 py-0.5 text-[10px] font-medium rounded uppercase tracking-wider ${
        engine === "whisper"
          ? "bg-blue-500/10 text-blue-500"
          : "bg-emerald-500/10 text-emerald-500"
      }`}
    >
      {engine}
    </span>
  );
}

function ModelSelect({
  value,
  onChange,
  models,
  label,
}: {
  value: string;
  onChange: (id: string) => void;
  models: ModelStatusEntry[];
  label: string;
}) {
  const readyModels = models.filter((m) => m.ready);
  return (
    <SettingRow label={label} description="Only downloaded models are available">
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="appearance-none bg-secondary border border-border rounded-md px-3 py-1.5 pr-7 text-sm text-foreground cursor-pointer hover:border-primary/40 transition-colors"
        >
          {readyModels.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
          {readyModels.length === 0 && (
            <option value="" disabled>
              No models downloaded
            </option>
          )}
        </select>
        <ChevronDown
          size={12}
          className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground"
        />
      </div>
    </SettingRow>
  );
}

export default function ModelPage({
  models,
  liveModel,
  downloadProgress,
  downloadingModelId,
  transcriptionLanguage,
  translateToEnglish,
  onDownloadModel,
  onDeleteModel,
  onLiveModelChange,
  onLanguageChange,
  onTranslateChange,
}: Props) {
  const liveModelEntry = models.find((m) => m.id === liveModel);
  const isWhisper = liveModelEntry?.engine === "whisper";
  const isTurbo = liveModel.includes("turbo");
  const showTranslate = isWhisper && !isTurbo && transcriptionLanguage !== "en";

  return (
    <div className="space-y-4">
      <SectionCard title="Model Assignment" icon={<Box size={14} />}>
        <ModelSelect
          value={liveModel}
          onChange={onLiveModelChange}
          models={models}
          label="Live Recording"
        />
      </SectionCard>

      {isWhisper && (
        <SectionCard title="Language" icon={<Languages size={14} />}>
          <SettingRow
            label="Transcription Language"
            description="Language of the audio being recorded"
          >
            <div className="relative">
              <select
                value={transcriptionLanguage}
                onChange={(e) => onLanguageChange(e.target.value)}
                className="appearance-none bg-secondary border border-border rounded-md px-3 py-1.5 pr-7 text-sm text-foreground cursor-pointer hover:border-primary/40 transition-colors"
              >
                {LANGUAGES.map((lang) => (
                  <option key={lang.value} value={lang.value}>
                    {lang.label}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={12}
                className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground"
              />
            </div>
          </SettingRow>
          {showTranslate && (
            <SettingRow
              label="Translate to English"
              description="Output English text regardless of spoken language"
            >
              <Switch
                checked={translateToEnglish}
                onCheckedChange={onTranslateChange}
              />
            </SettingRow>
          )}
        </SectionCard>
      )}

      <SectionCard title="Available Models" icon={<Download size={14} />}>
        <div className="divide-y divide-border">
          {models.map((model) => {
            const isDownloading = downloadingModelId === model.id && downloadProgress != null;
            return (
              <div key={model.id} className="py-3 flex items-center gap-3">
                {/* Status dot */}
                <div
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    model.ready ? "bg-emerald-500" : "bg-muted-foreground/30"
                  }`}
                />

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{model.name}</span>
                    <EngineBadge engine={model.engine} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {model.description}
                  </p>
                  <div className="text-[11px] text-muted-foreground/70 mt-0.5">
                    {model.ready
                      ? `${formatBytes(model.diskSize)} on disk`
                      : `~${model.sizeLabel} download`}
                  </div>
                  {isDownloading && downloadProgress && (
                    <div className="mt-2 space-y-1">
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all duration-300"
                          style={{ width: `${downloadProgress.progress}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>{downloadProgress.file}</span>
                        <span>{downloadProgress.progress}%</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Action */}
                <div className="shrink-0">
                  {model.ready ? (
                    <button
                      onClick={() => onDeleteModel(model.id)}
                      disabled={isDownloading}
                      className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md
                                 bg-secondary border border-border text-muted-foreground
                                 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30
                                 transition-colors disabled:opacity-50"
                    >
                      <Trash2 size={11} />
                      Delete
                    </button>
                  ) : (
                    <button
                      onClick={() => onDownloadModel(model.id)}
                      disabled={isDownloading || downloadingModelId != null}
                      className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md
                                 bg-primary text-primary-foreground hover:bg-primary/90
                                 transition-colors disabled:opacity-50"
                    >
                      {isDownloading ? (
                        <Loader2 size={11} className="animate-spin" />
                      ) : (
                        <Download size={11} />
                      )}
                      Download
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>
    </div>
  );
}
