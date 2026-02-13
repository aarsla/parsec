import { invoke } from "@tauri-apps/api/core";
import { load } from "@tauri-apps/plugin-store";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Info, Settings as SettingsIcon, ExternalLink } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { SectionCard, SettingRow } from "./shared";

export default function AboutPage({ liveModelName }: { liveModelName: string }) {
  return (
    <div className="space-y-4">
      <SectionCard title="About AudioShift" icon={<Info size={14} />}>
        <SettingRow label="Version" description="Current app version">
          <span className="text-sm text-muted-foreground font-mono">
            0.1.5
          </span>
        </SettingRow>
        <Separator />
        <SettingRow label="Speech Model" description="Local transcription engine">
          <span className="text-sm text-muted-foreground font-mono">
            {liveModelName}
          </span>
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
              invoke("show_onboarding");
            }}
            className="px-2.5 py-1 text-xs rounded-md bg-secondary border border-border
                       hover:bg-accent text-muted-foreground transition-colors"
          >
            Redo Setup
          </button>
        </SettingRow>
      </SectionCard>
      <p className="text-[11px] text-muted-foreground/50 text-center">
        &copy; 2026 AudioShift
      </p>
    </div>
  );
}
