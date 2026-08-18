import type { ReactNode } from "react";
import { Clock3 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Shared form/list primitives used by every module's real (non-demo)
 * screens - originally written for POS (screens/PosModuleShell.tsx and
 * friends), promoted here once School's screens needed the same pieces,
 * so no module's screens import from another module's folder. `Field` now
 * wraps the real ported shadcn `Label`; call sites compose it with the
 * real shadcn `Input`/`Select`/`Checkbox` directly rather than through a
 * shared inline-style object, matching how the web app itself builds forms.
 */
/**
 * Every field row uses `items-end` so labels/inputs line up along their
 * bottom edge. The hint line always renders (invisible when absent, never
 * removed) so every Field in a row has the same box height regardless of
 * which fields happen to carry a hint - otherwise `items-end` pins the
 * bottoms together and a field with no hint gets pushed down relative to
 * one that has it, visibly misaligning inputs (e.g. Name next to Subject
 * on the Exams screen, or Grade next to Student on the results form).
 */
export function Field({ label, id, hint, children, className }: { label: string; id: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      <p className={cn("m-0 text-xs text-muted-foreground", !hint && "invisible")}>{hint || " "}</p>
    </div>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="m-0 text-[0.8125rem] text-destructive">
      {children}
    </p>
  );
}

/** The same "Pending sync" / "Synced" indicator ModuleDetailView.tsx uses, factored out here since every real module screen's list rows need it. */
export function SyncBadge({ pending }: { pending: boolean }) {
  if (!pending) return <span className="shrink-0 text-xs text-muted-foreground">Synced</span>;
  return (
    <Badge variant="outline" className="shrink-0 gap-1 border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400">
      <Clock3 size={12} aria-hidden="true" />
      Pending sync
    </Badge>
  );
}

export function formatRelativeTime(iso: string): string {
  const diffMinutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  return diffHours < 24 ? `${diffHours}h ago` : new Date(iso).toLocaleDateString();
}

export function formatMoney(amount: string): string {
  const value = Number(amount);
  return Number.isFinite(value) ? value.toFixed(2) : amount;
}
