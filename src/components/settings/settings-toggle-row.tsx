import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

/**
 * The standard shape for a single boolean setting: bordered row, label (plus
 * an optional secondary description line) on the left, the actual toggle on
 * the right. Used across every module's settings page instead of each one
 * hand-rolling its own checkbox/label markup, so toggles look and behave
 * identically everywhere a tenant configures on/off behavior.
 */
export function SettingsToggleRow({
  id,
  name,
  label,
  description,
  defaultChecked,
  disabled,
}: {
  id: string;
  name: string;
  label: string;
  description?: string;
  defaultChecked?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
      <Label htmlFor={id} className="flex flex-col items-start gap-1">
        <span className="font-medium leading-none">{label}</span>
        {description ? <span className="text-sm font-normal text-muted-foreground">{description}</span> : null}
      </Label>
      <Switch id={id} name={name} defaultChecked={defaultChecked} disabled={disabled} />
    </div>
  );
}
