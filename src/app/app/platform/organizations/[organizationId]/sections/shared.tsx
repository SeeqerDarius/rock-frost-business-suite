import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** A single labelled number in the pane's top summary strip. */
export function StatTile({ label, value, tone }: { label: string; value: string; tone?: "warning" }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={tone === "warning" ? "mt-1 text-xl font-semibold text-destructive" : "mt-1 text-xl font-semibold"}>{value}</p>
    </div>
  );
}

/**
 * The pane's one row shape for "here is a setting, here is what it does, here
 * is its control". Every toggle, grant, and module row uses it, so an operator
 * scanning the page reads the same left-to-right shape each time instead of a
 * different layout per card.
 */
export function SettingRow({
  title,
  status,
  help,
  control,
  children,
}: {
  title: string;
  status?: React.ReactNode;
  help?: string;
  control?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">{title}</p>
            {status}
          </div>
          {help ? <p className="max-w-prose text-xs text-muted-foreground">{help}</p> : null}
        </div>
        {control ? <div className="shrink-0">{control}</div> : null}
      </div>
      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}

export function Field({
  label,
  name,
  defaultValue,
  type = "text",
  required,
}: {
  label: string;
  name: string;
  defaultValue: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} defaultValue={defaultValue} type={type} required={required} />
    </div>
  );
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${exponent === 0 ? value : value.toFixed(1)} ${units[exponent]}`;
}
