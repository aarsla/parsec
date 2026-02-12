import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  Plus, X, Copy, Check, FolderOpen, FileText,
  AlertCircle, Loader2,
} from "lucide-react";
import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { FileTranscriptionStatus } from "./shared";

const MEDIA_EXTS = ["mp3", "m4a", "ogg", "wav", "flac", "aac", "opus", "wma", "mp4", "m4v", "mkv", "webm", "mov"];

interface FilesPageProps {
  fileStatus: FileTranscriptionStatus;
}

function formatDuration(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function FilesPage({ fileStatus }: FilesPageProps) {
  const [copied, setCopied] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const busy = fileStatus.status === "converting" || fileStatus.status === "transcribing";

  const startTranscription = async (path: string) => {
    try {
      await invoke("transcribe_file", { path });
    } catch (e) {
      console.error("Failed to start transcription:", e);
    }
  };

  // Drag-and-drop
  useEffect(() => {
    const win = getCurrentWebviewWindow();
    const unlisten = win.onDragDropEvent(async (event) => {
      if (event.payload.type === "enter") {
        setDragOver(true);
      } else if (event.payload.type === "leave") {
        setDragOver(false);
      } else if (event.payload.type === "drop") {
        setDragOver(false);
        const path = event.payload.paths.find((p) => {
          const ext = p.split(".").pop()?.toLowerCase() ?? "";
          return MEDIA_EXTS.includes(ext);
        });
        if (path) startTranscription(path);
      }
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  const handlePickFile = async () => {
    const file = await open({
      multiple: false,
      filters: [{ name: "Media Files", extensions: MEDIA_EXTS }],
    });
    if (file) startTranscription(file as string);
  };

  const handleCancel = () => {
    invoke("cancel_file_transcription");
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.error("Failed to copy:", e);
    }
  };

  const handleReveal = (path: string) => invoke("reveal_in_finder", { path });
  const handleOpen = (path: string) => invoke("open_in_editor", { path });

  return (
    <ScrollArea className="h-full">
      <div className="p-6 space-y-5">
        {/* Drop zone */}
        <button
          onClick={busy ? undefined : handlePickFile}
          disabled={busy}
          className={`w-full border-2 border-dashed rounded-xl p-8 transition-colors
            flex flex-col items-center gap-2 text-muted-foreground
            ${dragOver ? "border-primary bg-primary/5" : "border-border"}
            ${busy ? "opacity-50 cursor-not-allowed" : "hover:border-primary/40 hover:bg-primary/5 cursor-pointer"}`}
        >
          <Plus size={24} />
          <span className="text-sm">
            {busy ? "Processing..." : "Drop a media file here or click to select"}
          </span>
          <span className="text-xs text-muted-foreground/60">MP3, M4A, WAV, FLAC, MP4, MKV, MOV...</span>
        </button>

        {/* Processing status */}
        {(fileStatus.status === "converting" || fileStatus.status === "transcribing") && (
          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Loader2 size={14} className="text-primary animate-spin" />
                <span className="text-sm font-medium text-foreground">
                  {fileStatus.status === "converting" ? "Converting..." : "Transcribing..."}
                </span>
              </div>
              <button
                onClick={handleCancel}
                className="flex items-center gap-1 px-2 py-1 text-xs rounded-md
                           border border-destructive/30 text-destructive
                           hover:bg-destructive/10 transition-colors"
              >
                <X size={11} />
                Cancel
              </button>
            </div>

            {fileStatus.fileName && (
              <p className="text-xs text-muted-foreground truncate">
                {fileStatus.fileName}
                {fileStatus.durationSecs != null && (
                  <span> · {formatDuration(Math.round(fileStatus.durationSecs))} audio</span>
                )}
              </p>
            )}

            {fileStatus.status === "transcribing" && (
              <>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-1000"
                    style={{ width: `${Math.max(fileStatus.progress, 2)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{fileStatus.progress}%</span>
                  <span className="font-mono">
                    {formatDuration(fileStatus.elapsedSecs)}
                    {fileStatus.estimatedSecs > 0 && ` / ~${formatDuration(fileStatus.estimatedSecs)}`}
                  </span>
                </div>
              </>
            )}
          </div>
        )}

        {/* Error */}
        {fileStatus.status === "error" && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 space-y-2">
            <div className="flex items-start gap-2">
              <AlertCircle size={14} className="text-destructive mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-destructive">Transcription failed</p>
                {fileStatus.fileName && (
                  <p className="text-xs text-muted-foreground mt-0.5">{fileStatus.fileName}</p>
                )}
                {fileStatus.error && (
                  <p className="text-xs text-destructive/80 mt-1">{fileStatus.error}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Completed result */}
        {fileStatus.status === "completed" && fileStatus.resultText && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-foreground">{fileStatus.fileName}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {fileStatus.durationSecs != null && `${formatDuration(Math.round(fileStatus.durationSecs))} audio · `}
                  {fileStatus.decodeSecs != null && fileStatus.decodeSecs >= 1
                    ? `decoded in ${formatDuration(Math.round(fileStatus.decodeSecs))}, `
                    : ""}
                  transcribed in {formatDuration(fileStatus.elapsedSecs)}
                </p>
              </div>
            </div>

            {/* Transcription text */}
            <div className="bg-card border border-border rounded-lg p-4">
              <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                {fileStatus.resultText}
              </p>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => handleCopy(fileStatus.resultText!)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md
                           bg-secondary border border-border hover:bg-accent
                           text-muted-foreground transition-colors"
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? "Copied" : "Copy Text"}
              </button>
              {fileStatus.outputPath && (
                <>
                  <button
                    onClick={() => handleOpen(fileStatus.outputPath!)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md
                               bg-secondary border border-border hover:bg-accent
                               text-muted-foreground transition-colors"
                  >
                    <FileText size={12} />
                    Open Transcription
                  </button>
                  <button
                    onClick={() => handleReveal(fileStatus.outputPath!)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md
                               bg-secondary border border-border hover:bg-accent
                               text-muted-foreground transition-colors"
                  >
                    <FolderOpen size={12} />
                    Show in Finder
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Idle empty state */}
        {fileStatus.status === "idle" && (
          <div className="text-center py-8">
            <FileText size={32} className="mx-auto mb-2 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground">
              Transcribe audio and video files to text using the local AI model
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Saved to ~/Documents/AudioShift Transcriptions
            </p>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
