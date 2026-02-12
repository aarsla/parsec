import { Shield } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { SectionCard, PermissionIndicator, type PermissionStatus } from "./shared";

interface Props {
  micPermission: PermissionStatus;
  a11yPermission: PermissionStatus;
  onCheckPermissions: () => void;
  onOpenSettings: (pane: string) => void;
}

export default function PermissionsPage({
  micPermission, a11yPermission,
  onCheckPermissions, onOpenSettings,
}: Props) {
  return (
    <div className="space-y-4">
      <SectionCard title="Permissions" icon={<Shield size={14} />}>
        <PermissionIndicator
          label="Microphone"
          status={micPermission}
          onOpen={() => onOpenSettings("microphone")}
        />
        <Separator />
        <PermissionIndicator
          label="Accessibility"
          status={a11yPermission}
          onOpen={() => onOpenSettings("accessibility")}
        />
        <div className="py-2">
          <button
            onClick={onCheckPermissions}
            className="text-xs text-primary hover:text-primary/80 transition-colors"
          >
            Recheck permissions
          </button>
        </div>
      </SectionCard>
    </div>
  );
}
