import { Settings as SettingsIcon, Mic } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { SectionCard, SettingRow, type StartSound, START_SOUNDS } from "./shared";

interface Props {
  autostart: boolean;
  showInDock: boolean;
  startSound: StartSound;
  isMas?: boolean;
  onAutostartChange: (enabled: boolean) => void;
  onDockChange: (visible: boolean) => void;
  onStartSoundChange: (sound: StartSound) => void;
}

export default function GeneralPage({
  autostart, showInDock, startSound, isMas: _isMas,
  onAutostartChange, onDockChange, onStartSoundChange,
}: Props) {
  const isMac = navigator.userAgent.includes("Mac");

  return (
    <div className="space-y-4">
      <SectionCard title={isMac ? "Startup & Dock" : "Startup"} icon={<SettingsIcon size={14} />}>
        <SettingRow
          label="Launch at startup"
          description="Automatically start AudioShift when you log in"
        >
          <Switch checked={autostart} onCheckedChange={onAutostartChange} />
        </SettingRow>
        {isMac && (
          <>
            <Separator />
            <SettingRow
              label="Show in Dock"
              description="Display AudioShift icon in the Dock"
              note="Note: May require app restart to take effect."
            >
              <Switch checked={showInDock} onCheckedChange={onDockChange} />
            </SettingRow>
          </>
        )}
      </SectionCard>

      <SectionCard title="Sound" icon={<Mic size={14} />}>
        <SettingRow
          label="Start Sound"
          description="Choose which sound plays when recording starts"
        >
          <Select
            value={startSound}
            onValueChange={(v) => onStartSoundChange(v as StartSound)}
          >
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {START_SOUNDS.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>
      </SectionCard>
    </div>
  );
}
