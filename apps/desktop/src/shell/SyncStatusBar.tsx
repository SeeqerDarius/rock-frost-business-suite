import { RefreshCw } from "lucide-react";
import { Button } from "@/components/Button";
import { StatusPill } from "@/components/StatusPill";
import { deriveShellStatus } from "@/shell/status-mapping";
import { useApp } from "@/state/AppProvider";

function formatLastSync(iso: string | null): string {
  if (!iso) return "Never synced";
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.round(diffMs / 60_000);
  if (diffMinutes < 1) return "Synced just now";
  if (diffMinutes < 60) return `Synced ${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `Synced ${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  return `Synced ${date.toLocaleDateString()} at ${date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

export function SyncStatusBar() {
  const { syncStatus, syncNow, lockState } = useApp();

  const shellStatus = deriveShellStatus(syncStatus?.state ?? "idle", lockState);
  const pending = syncStatus?.pendingMutationCount ?? 0;
  const syncing = syncStatus?.state === "syncing";

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "0.75rem",
        padding: "0.75rem 1rem",
        borderRadius: "var(--rf-radius-lg)",
        border: "1px solid var(--rf-border)",
        background: "var(--rf-card)",
      }}
    >
      <StatusPill status={shellStatus} />

      <span style={{ fontSize: "0.8125rem", color: "var(--rf-muted-foreground)" }}>
        {formatLastSync(syncStatus?.lastSuccessfulSyncAt ?? null)}
      </span>

      <span
        aria-live="polite"
        style={{
          fontSize: "0.8125rem",
          fontWeight: 600,
          color: pending > 0 ? "var(--rf-warning)" : "var(--rf-muted-foreground)",
        }}
      >
        {pending > 0 ? `${pending} change${pending === 1 ? "" : "s"} pending sync` : "All changes synced"}
      </span>

      <Button
        variant="secondary"
        onClick={() => void syncNow()}
        loading={syncing}
        disabled={shellStatus === "revoked" || shellStatus === "session_expired"}
        style={{ marginLeft: "auto", padding: "0.45rem 0.9rem" }}
      >
        <RefreshCw size={14} aria-hidden="true" />
        {syncing ? "Syncing" : "Sync now"}
      </Button>
    </div>
  );
}
