import { Keyboard, Mic } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import LevelMeter from "@/components/LevelMeter";
import { SectionCard, SettingRow, HotkeyRecorder } from "./shared";

interface Props {
  hotkey: string;
  devices: string[];
  selectedDevice: string;
  testingMic: boolean;
  monitorLevel: number;
  onHotkeyChange: (shortcut: string) => void;
  onDeviceChange: (device: string) => void;
  onTestingMicChange: (testing: boolean) => void;
}

export default function RecordingPage({
  hotkey, devices, selectedDevice, testingMic, monitorLevel,
  onHotkeyChange, onDeviceChange, onTestingMicChange,
}: Props) {
  return (
    <div className="space-y-4">
      <SectionCard title="Hotkey" icon={<Keyboard size={14} />}>
        <SettingRow
          label="Record Shortcut"
          description="Press to start recording, press again to stop"
        >
          {hotkey && (
            <HotkeyRecorder value={hotkey} onChange={onHotkeyChange} />
          )}
        </SettingRow>
      </SectionCard>

      <SectionCard title="Input" icon={<Mic size={14} />}>
        <SettingRow
          label="Input Device"
          description="Microphone used for voice recording"
        >
          <Select value={selectedDevice} onValueChange={onDeviceChange}>
            <SelectTrigger className="w-72">
              <SelectValue placeholder="Select device" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">System Default</SelectItem>
              {devices.map((d) => (
                <SelectItem key={d} value={d}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>
      </SectionCard>

      <SectionCard title="Test" icon={<Mic size={14} />}>
        <div className="flex items-center gap-3 py-3">
          <button
            onClick={() => onTestingMicChange(!testingMic)}
            className={`shrink-0 px-2.5 py-1 text-xs rounded-md border transition-colors ${
              testingMic
                ? "bg-primary/15 border-primary text-primary"
                : "bg-secondary border-border text-muted-foreground hover:border-primary/40"
            }`}
          >
            {testingMic ? "Stop Test" : "Test Microphone"}
          </button>
          {testingMic && (
            <div className="flex-1">
              <LevelMeter level={monitorLevel} />
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
