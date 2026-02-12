import { ClipboardPaste } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { SectionCard, SettingRow } from "./shared";

interface Props {
  pasteMode: "auto" | "clipboard";
  onPasteModeChange: (mode: "auto" | "clipboard") => void;
}

export default function OutputPage({ pasteMode, onPasteModeChange }: Props) {
  return (
    <div className="space-y-4">
      <SectionCard title="Paste Behavior" icon={<ClipboardPaste size={14} />}>
        <SettingRow
          label="Auto-paste"
          description="Automatically paste transcribed text into the active app"
          note={
            pasteMode === "auto"
              ? "Copies text and simulates \u2318V"
              : "You paste manually with \u2318V"
          }
        >
          <Switch
            checked={pasteMode === "auto"}
            onCheckedChange={(checked) =>
              onPasteModeChange(checked ? "auto" : "clipboard")
            }
          />
        </SettingRow>
      </SectionCard>
    </div>
  );
}
