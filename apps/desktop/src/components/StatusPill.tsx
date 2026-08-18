import { AlertTriangle, Ban, Clock, RefreshCw, Wifi, WifiOff } from "lucide-react";
import type { ShellStatusIndicator } from "@/shell/status-mapping";
import { cn } from "@/lib/utils";

interface StatusMeta {
  label: string;
  Icon: typeof Wifi;
  className: string;
  description: string;
}

const STATUS_META: Record<ShellStatusIndicator, StatusMeta> = {
  online: {
    label: "Online",
    Icon: Wifi,
    className: "bg-green-500/15 text-green-700 dark:text-green-400",
    description: "Connected. Changes sync automatically.",
  },
  offline: {
    label: "Offline",
    Icon: WifiOff,
    className: "bg-muted text-muted-foreground",
    description: "No connection. Your work is saved on this device and will sync once you're back online.",
  },
  syncing: {
    label: "Syncing",
    Icon: RefreshCw,
    className: "bg-primary/15 text-primary",
    description: "Sending and receiving updates now.",
  },
  conflict: {
    label: "Conflict",
    Icon: AlertTriangle,
    className: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    description: "Some changes need your review before they can sync.",
  },
  session_expired: {
    label: "Session expired",
    Icon: Clock,
    className: "bg-destructive/15 text-destructive",
    description: "You've been offline too long. Reconnect and sign in again to continue.",
  },
  revoked: {
    label: "Device revoked",
    Icon: Ban,
    className: "bg-destructive text-destructive-foreground",
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
      className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.8125rem] font-semibold", meta.className)}
    >
      <meta.Icon size={14} aria-hidden="true" className={spinning ? "rf-spin" : undefined} />
      {meta.label}
    </span>
  );
}
