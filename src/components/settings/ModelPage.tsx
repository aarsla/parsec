import { useState, useRef, useEffect } from "react";
import { Box, Download, Loader2, Trash2, ChevronDown, Languages, Search } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { SectionCard, SettingRow, formatBytes, type ModelStatusEntry, type DownloadProgress } from "./shared";

const LANGUAGES = [
  { value: "auto", label: "Auto-detect" },
  { value: "af", label: "Afrikaans" },
  { value: "sq", label: "Albanian" },
  { value: "am", label: "Amharic" },
  { value: "ar", label: "Arabic" },
  { value: "hy", label: "Armenian" },
  { value: "as", label: "Assamese" },
  { value: "az", label: "Azerbaijani" },
  { value: "ba", label: "Bashkir" },
  { value: "eu", label: "Basque" },
  { value: "be", label: "Belarusian" },
  { value: "bn", label: "Bengali" },
  { value: "bs", label: "Bosnian" },
  { value: "br", label: "Breton" },
  { value: "bg", label: "Bulgarian" },
  { value: "yue", label: "Cantonese" },
  { value: "ca", label: "Catalan" },
  { value: "zh", label: "Chinese" },
  { value: "hr", label: "Croatian" },
  { value: "cs", label: "Czech" },
  { value: "da", label: "Danish" },
  { value: "nl", label: "Dutch" },
  { value: "en", label: "English" },
  { value: "et", label: "Estonian" },
  { value: "fo", label: "Faroese" },
  { value: "fi", label: "Finnish" },
  { value: "fr", label: "French" },
  { value: "gl", label: "Galician" },
  { value: "ka", label: "Georgian" },
  { value: "de", label: "German" },
  { value: "el", label: "Greek" },
  { value: "gu", label: "Gujarati" },
  { value: "ht", label: "Haitian Creole" },
  { value: "ha", label: "Hausa" },
  { value: "haw", label: "Hawaiian" },
  { value: "he", label: "Hebrew" },
  { value: "hi", label: "Hindi" },
  { value: "hu", label: "Hungarian" },
  { value: "is", label: "Icelandic" },
  { value: "id", label: "Indonesian" },
  { value: "it", label: "Italian" },
  { value: "ja", label: "Japanese" },
  { value: "jw", label: "Javanese" },
  { value: "kn", label: "Kannada" },
  { value: "kk", label: "Kazakh" },
  { value: "km", label: "Khmer" },
  { value: "ko", label: "Korean" },
  { value: "lo", label: "Lao" },
  { value: "la", label: "Latin" },
  { value: "lv", label: "Latvian" },
  { value: "ln", label: "Lingala" },
  { value: "lt", label: "Lithuanian" },
  { value: "lb", label: "Luxembourgish" },
  { value: "mk", label: "Macedonian" },
  { value: "mg", label: "Malagasy" },
  { value: "ms", label: "Malay" },
  { value: "ml", label: "Malayalam" },
  { value: "mt", label: "Maltese" },
  { value: "mi", label: "Maori" },
  { value: "mr", label: "Marathi" },
  { value: "mn", label: "Mongolian" },
  { value: "my", label: "Myanmar" },
  { value: "ne", label: "Nepali" },
  { value: "no", label: "Norwegian" },
  { value: "nn", label: "Nynorsk" },
  { value: "oc", label: "Occitan" },
  { value: "ps", label: "Pashto" },
  { value: "fa", label: "Persian" },
  { value: "pl", label: "Polish" },
  { value: "pt", label: "Portuguese" },
  { value: "pa", label: "Punjabi" },
  { value: "ro", label: "Romanian" },
  { value: "ru", label: "Russian" },
  { value: "sa", label: "Sanskrit" },
  { value: "sr", label: "Serbian" },
  { value: "sn", label: "Shona" },
  { value: "sd", label: "Sindhi" },
  { value: "si", label: "Sinhala" },
  { value: "sk", label: "Slovak" },
  { value: "sl", label: "Slovenian" },
  { value: "so", label: "Somali" },
  { value: "es", label: "Spanish" },
  { value: "su", label: "Sundanese" },
  { value: "sw", label: "Swahili" },
  { value: "sv", label: "Swedish" },
  { value: "tl", label: "Tagalog" },
  { value: "tg", label: "Tajik" },
  { value: "ta", label: "Tamil" },
  { value: "tt", label: "Tatar" },
  { value: "te", label: "Telugu" },
  { value: "th", label: "Thai" },
  { value: "bo", label: "Tibetan" },
  { value: "tr", label: "Turkish" },
  { value: "tk", label: "Turkmen" },
  { value: "uk", label: "Ukrainian" },
  { value: "ur", label: "Urdu" },
  { value: "uz", label: "Uzbek" },
  { value: "vi", label: "Vietnamese" },
  { value: "cy", label: "Welsh" },
  { value: "yi", label: "Yiddish" },
  { value: "yo", label: "Yoruba" },
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

function LanguageSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedLabel = LANGUAGES.find((l) => l.value === value)?.label ?? value;

  const filtered = LANGUAGES.filter((l) =>
    l.label.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 whitespace-nowrap bg-secondary border border-border rounded-md px-3 py-1.5 text-sm text-foreground cursor-pointer hover:border-primary/40 transition-colors"
      >
        {selectedLabel}
        <ChevronDown size={12} className="text-muted-foreground shrink-0" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-48 bg-popover border border-border rounded-md shadow-lg z-50">
          <div className="p-1.5 border-b border-border">
            <div className="relative">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search languages..."
                className="w-full bg-secondary border border-border rounded px-2 py-1 pl-7 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/40"
              />
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <div className="px-2 py-3 text-xs text-muted-foreground text-center">No languages found</div>
            ) : (
              filtered.map((lang) => (
                <button
                  key={lang.value}
                  type="button"
                  onClick={() => {
                    onChange(lang.value);
                    setOpen(false);
                    setSearch("");
                  }}
                  className={`w-full text-left px-2 py-1.5 text-sm rounded cursor-pointer transition-colors ${
                    lang.value === value
                      ? "bg-primary/10 text-primary"
                      : "text-foreground hover:bg-secondary"
                  }`}
                >
                  {lang.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CustomSelect<T extends { value: string; label: string }>({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: T[];
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedLabel = options.find((o) => o.value === value)?.label ?? value;

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 whitespace-nowrap bg-secondary border border-border rounded-md px-3 py-1.5 text-sm text-foreground cursor-pointer hover:border-primary/40 transition-colors"
      >
        {selectedLabel}
        <ChevronDown size={12} className="text-muted-foreground shrink-0" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-64 bg-popover border border-border rounded-md shadow-lg z-50">
          <div className="max-h-60 overflow-y-auto p-1">
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`w-full text-left px-2 py-1.5 text-sm rounded cursor-pointer whitespace-nowrap transition-colors ${
                  opt.value === value
                    ? "bg-primary/10 text-primary"
                    : "text-foreground hover:bg-secondary"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
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
  const options = readyModels.length > 0
    ? readyModels.map((m) => ({ value: m.id, label: m.name }))
    : [{ value: "", label: "No models downloaded" }];

  return (
    <SettingRow label={label} description="Only downloaded models are available">
      <CustomSelect value={value} onChange={onChange} options={options} />
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
            <LanguageSelect
              value={transcriptionLanguage}
              onChange={onLanguageChange}
            />
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
