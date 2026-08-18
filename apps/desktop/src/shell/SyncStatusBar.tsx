import { RefreshCw } from "lucide-react";
import { Button } from "@/components/Button";
import { StatusPill } from "@/components/StatusPill";
import { cn } from "@/lib/utils";
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
    <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-4 py-3">
      <StatusPill status={shellStatus} />

      <span className="text-[0.8125rem] text-muted-foreground">
        {formatLastSync(syncStatus?.lastSuccessfulSyncAt ?? null)}
      </span>

      <span
        aria-live="polite"
        className={cn("text-[0.8125rem] font-semibold", pending > 0 ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")}
      >
        {pending > 0 ? `${pending} change${pending === 1 ? "" : "s"} pending sync` : "All changes synced"}
      </span>

      <Button
        variant="secondary"
        onClick={() => void syncNow()}
        loading={syncing}
        disabled={shellStatus === "revoked" || shellStatus === "session_expired"}
        className="ml-auto"
      >
        <RefreshCw size={14} aria-hidden="true" />
        {syncing ? "Syncing" : "Sync now"}
      </Button>
    </div>
  );
}
