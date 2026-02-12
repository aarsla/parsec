import { Sun, Layers } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import {
  SectionCard, SettingRow, ThemePicker, AccentPicker,
  OVERLAY_THEMES, OVERLAY_POSITIONS,
  type ThemeMode, type AccentColor, type OverlayTheme, type OverlayPosition,
} from "./shared";

interface Props {
  themeMode: ThemeMode;
  accentColor: AccentColor;
  overlayPosition: OverlayPosition;
  overlayTheme: OverlayTheme;
  onThemeChange: (mode: ThemeMode) => void;
  onAccentChange: (accent: AccentColor) => void;
  onOverlayPositionChange: (pos: OverlayPosition) => void;
  onOverlayThemeChange: (theme: OverlayTheme) => void;
}

export default function AppearancePage({
  themeMode, accentColor, overlayPosition, overlayTheme,
  onThemeChange, onAccentChange, onOverlayPositionChange, onOverlayThemeChange,
}: Props) {
  return (
    <div className="space-y-4">
      <SectionCard title="Theme" icon={<Sun size={14} />}>
        <SettingRow
          label="Theme"
          description="Choose light, dark, or match your system"
        >
          <ThemePicker value={themeMode} onChange={onThemeChange} />
        </SettingRow>
        <Separator />
        <SettingRow
          label="Accent Color"
          description="Pick a preset accent color for the app"
        >
          <AccentPicker value={accentColor} onChange={onAccentChange} />
        </SettingRow>
      </SectionCard>

      <SectionCard title="Overlay" icon={<Layers size={14} />}>
        <SettingRow
          label="Overlay Theme"
          description="Visual style for the recording overlay"
        >
          <div className="flex items-center gap-1 bg-secondary rounded-lg p-0.5">
            {OVERLAY_THEMES.map((t) => (
              <button
                key={t.id}
                onClick={() => onOverlayThemeChange(t.id)}
                title={t.desc}
                className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
                  overlayTheme === t.id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </SettingRow>
        <Separator />
        <SettingRow
          label="Screen Position"
          description="Where the recording overlay appears"
        >
          <div className="grid grid-cols-3 gap-1 w-[72px]">
            {OVERLAY_POSITIONS.map((pos) => (
              <button
                key={pos}
                onClick={() => onOverlayPositionChange(pos)}
                title={pos.replace("-", " ")}
                className={`w-5 h-5 rounded-sm flex items-center justify-center transition-colors ${
                  overlayPosition === pos
                    ? "bg-primary"
                    : "bg-secondary hover:bg-accent border border-border"
                }`}
              >
                <span
                  className={`block w-1.5 h-1.5 rounded-full ${
                    overlayPosition === pos
                      ? "bg-primary-foreground"
                      : "bg-muted-foreground/50"
                  }`}
                />
              </button>
            ))}
          </div>
        </SettingRow>
      </SectionCard>
    </div>
  );
}
