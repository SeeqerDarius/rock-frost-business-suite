import type { ReactNode, CSSProperties } from "react";
import { Clock3 } from "lucide-react";

export const inputStyle: CSSProperties = {
  width: "100%",
  padding: "0.6rem 0.75rem",
  borderRadius: "var(--rf-radius-md)",
  border: "1px solid var(--rf-border)",
  background: "var(--rf-background)",
  fontSize: "0.875rem",
};

export const selectStyle: CSSProperties = { ...inputStyle };

export function Field({ label, id, hint, children }: { label: string; id: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.3rem" }}>
        {label}
      </label>
      {children}
      {hint ? <p style={{ margin: "0.3rem 0 0", fontSize: "0.75rem", color: "var(--rf-muted-foreground)" }}>{hint}</p> : null}
    </div>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <p role="alert" style={{ margin: 0, fontSize: "0.8125rem", color: "var(--rf-destructive)" }}>
      {children}
    </p>
  );
}

/** The same "Pending sync" / "Synced" indicator ModuleDetailView.tsx uses, factored out here since every POS list row needs it. */
export function SyncBadge({ pending }: { pending: boolean }) {
  if (!pending) return <span style={{ fontSize: "0.75rem", color: "var(--rf-muted-foreground)", flexShrink: 0 }}>Synced</span>;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.3rem",
        padding: "0.25rem 0.6rem",
        borderRadius: "999px",
        fontSize: "0.75rem",
        fontWeight: 700,
        color: "var(--rf-warning)",
        background: "color-mix(in oklch, var(--rf-warning) 18%, transparent)",
        flexShrink: 0,
      }}
    >
      <Clock3 size={12} aria-hidden="true" />
      Pending sync
    </span>
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
