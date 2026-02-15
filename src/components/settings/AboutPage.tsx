import { invoke } from "@tauri-apps/api/core";
import { load } from "@tauri-apps/plugin-store";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Info, Settings as SettingsIcon, ExternalLink } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { SectionCard, SettingRow } from "./shared";

interface Props {
  liveModelName: string;
  liveModelSize: string;
}

export default function AboutPage({
  liveModelName, liveModelSize,
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
          <p className="text-[11px] text-muted-foreground/60 mt-1 font-mono">v1.0.4</p>
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
            v1.0.4
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

      <SectionCard title="Setup" icon={<SettingsIcon size={14} />}>
        <SettingRow
          label="Onboarding"
          description="Run the initial setup wizard again"
        >
          <button
            onClick={async () => {
              const store = await load("settings.json");
              await store.delete("onboardingCompleted");
              await invoke("show_onboarding");
              getCurrentWebviewWindow().close();
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
