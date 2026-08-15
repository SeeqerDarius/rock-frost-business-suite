import { AlertTriangle, Ban, Clock, RefreshCw, Wifi, WifiOff } from "lucide-react";
import type { ShellStatusIndicator } from "@/shell/status-mapping";

interface StatusMeta {
  label: string;
  Icon: typeof Wifi;
  color: string;
  background: string;
  description: string;
}

const STATUS_META: Record<ShellStatusIndicator, StatusMeta> = {
  online: {
    label: "Online",
    Icon: Wifi,
    color: "var(--rf-success)",
    background: "color-mix(in oklch, var(--rf-success) 15%, transparent)",
    description: "Connected. Changes sync automatically.",
  },
  offline: {
    label: "Offline",
    Icon: WifiOff,
    color: "var(--rf-muted-foreground)",
    background: "var(--rf-muted)",
    description: "No connection. Your work is saved on this device and will sync once you're back online.",
  },
  syncing: {
    label: "Syncing",
    Icon: RefreshCw,
    color: "var(--rf-primary)",
    background: "color-mix(in oklch, var(--rf-primary) 15%, transparent)",
    description: "Sending and receiving updates now.",
  },
  conflict: {
    label: "Conflict",
    Icon: AlertTriangle,
    color: "var(--rf-warning)",
    background: "color-mix(in oklch, var(--rf-warning) 18%, transparent)",
    description: "Some changes need your review before they can sync.",
  },
  session_expired: {
    label: "Session expired",
    Icon: Clock,
    color: "var(--rf-destructive)",
    background: "color-mix(in oklch, var(--rf-destructive) 15%, transparent)",
    description: "You've been offline too long. Reconnect and sign in again to continue.",
  },
  revoked: {
    label: "Device revoked",
    Icon: Ban,
    color: "var(--rf-destructive-foreground)",
    background: "var(--rf-destructive)",
    description: "This device's access was removed. Cached business data has been cleared for your protection.",
  },
};

export function StatusPill({ status }: { status: ShellStatusIndicator }) {
  const meta = STATUS_META[status];
  const spinning = status === "syncing";
  return (
    <span
      role="status"
      aria-label={`${meta.label}. ${meta.description}`}
      title={meta.description}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.4rem",
        padding: "0.3rem 0.7rem",
        borderRadius: "999px",
        fontSize: "0.8125rem",
        fontWeight: 600,
        color: meta.color,
        background: meta.background,
      }}
    >
      <meta.Icon size={14} aria-hidden="true" className={spinning ? "rf-spin" : undefined} />
      {meta.label}
    </span>
  );
}
