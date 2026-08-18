import { useEffect, useState } from "react";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ErrorText } from "@/components/form-fields";
import { useApp } from "@/state/AppProvider";
import { getPermittedResolutionChoices, isProtectedEntityType } from "@/conflict/conflict-policy";
import { SyncClient } from "@/sync/sync-client";
import type { ConflictRecord } from "@/db/schema";
import type { ConflictResolutionChoice } from "@/contract/sync-contract";

const CHOICE_LABEL: Record<ConflictResolutionChoice, string> = {
  KEEP_CLOUD: "Keep cloud version",
};

function formatValue(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/**
 * Renders every open conflict with both values side by side, who made
 * each change and when, and only the resolution buttons the server's
 * `allowedResolutions` actually permits for that specific conflict: see
 * conflict/conflict-policy.ts. There is no "resolve all" shortcut and no
 * automatic pick-a-winner path anywhere in this component.
 */
export function ConflictResolutionPanel() {
  const { db, credentials } = useApp();
  const [conflicts, setConflicts] = useState<ConflictRecord[]>([]);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;

  useEffect(() => {
    void db.listConflicts("open").then(setConflicts);
  }, [db]);

  async function handleResolve(conflict: ConflictRecord, resolution: ConflictResolutionChoice) {
    if (!apiBaseUrl) {
      setError("No server address configured, cannot resolve this conflict yet.");
      return;
    }
    setResolvingId(conflict.conflictId);
    setError(null);
    try {
      const token = await credentials.get("accessToken");
      const client = new SyncClient({ apiBaseUrl, getAccessToken: () => token });
      await client.resolveConflict(conflict.conflictId, { resolution });
      await db.resolveConflict(conflict.conflictId, resolution);
      await db.appendAuditEvent("conflict_resolved", { conflictId: conflict.conflictId, resolution });
      setConflicts(await db.listConflicts("open"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resolve this conflict. Try again once you're back online.");
    } finally {
      setResolvingId(null);
    }
  }

  if (conflicts.length === 0) return null;

  return (
    <section aria-labelledby="conflicts-heading" className="flex flex-col gap-4">
      <h2 id="conflicts-heading" className="m-0 flex items-center gap-2 text-[1.05rem] font-bold text-amber-700 dark:text-amber-400">
        <AlertTriangle size={18} aria-hidden="true" />
        {conflicts.length} conflict{conflicts.length === 1 ? "" : "s"} need your review
      </h2>

      {error ? <ErrorText>{error}</ErrorText> : null}

      {conflicts.map((conflict) => {
        const choices = getPermittedResolutionChoices(conflict);
        const protectedEntity = isProtectedEntityType(conflict.entityType);
        return (
          <Card key={conflict.conflictId}>
            <div className="mb-3 flex items-center justify-between gap-4">
              <p className="m-0 text-sm font-bold">{conflict.entityType}</p>
              {protectedEntity ? (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-destructive">
                  <ShieldAlert size={13} aria-hidden="true" />
                  Requires review, cannot auto-resolve
                </span>
              ) : null}
            </div>

            <div className="mb-3.5 grid grid-cols-2 gap-3">
              <ConflictSide
                label="Your local change"
                value={conflict.localValue}
                changedAt={conflict.localChangedAt}
                changedBy={conflict.localChangedByUserName}
              />
              <ConflictSide
                label="Cloud value"
                value={conflict.cloudValue}
                changedAt={conflict.cloudChangedAt}
                changedBy={conflict.cloudChangedByUserName}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {choices.map((choice) => (
                <Button
                  key={choice}
                  variant="secondary"
                  loading={resolvingId === conflict.conflictId}
                  onClick={() => void handleResolve(conflict, choice)}
                >
                  {CHOICE_LABEL[choice]}
                </Button>
              ))}
              {choices.length === 0 ? (
                <p className="m-0 text-[0.8125rem] text-muted-foreground">
                  The server has not authorized any resolution for this conflict yet.
                </p>
              ) : null}
            </div>
          </Card>
        );
      })}
    </section>
  );
}

function ConflictSide({ label, value, changedAt, changedBy }: { label: string; value: unknown; changedAt: string; changedBy: string | null }) {
  return (
    <div className="rounded-md border p-2.5">
      <p className="m-0 text-xs font-bold text-muted-foreground">{label}</p>
      <p className="mt-0.5 mb-1.5 text-xs text-muted-foreground">
        {new Date(changedAt).toLocaleString()} {changedBy ? `by ${changedBy}` : ""}
      </p>
      <pre className="m-0 max-h-32 overflow-auto rounded-sm bg-muted p-2 text-xs break-words whitespace-pre-wrap">
        {formatValue(value)}
      </pre>
    </div>
  );
}
