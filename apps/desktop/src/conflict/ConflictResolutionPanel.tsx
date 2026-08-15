import { useEffect, useState } from "react";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
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
    <section aria-labelledby="conflicts-heading" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <h2 id="conflicts-heading" style={{ display: "flex", alignItems: "center", gap: "0.5rem", margin: 0, fontSize: "1.05rem", fontWeight: 700, color: "var(--rf-warning)" }}>
        <AlertTriangle size={18} aria-hidden="true" />
        {conflicts.length} conflict{conflicts.length === 1 ? "" : "s"} need your review
      </h2>

      {error ? (
        <p role="alert" style={{ margin: 0, fontSize: "0.8125rem", color: "var(--rf-destructive)" }}>
          {error}
        </p>
      ) : null}

      {conflicts.map((conflict) => {
        const choices = getPermittedResolutionChoices(conflict);
        const protectedEntity = isProtectedEntityType(conflict.entityType);
        return (
          <Card key={conflict.conflictId}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", marginBottom: "0.75rem" }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: "0.875rem" }}>{conflict.entityType}</p>
              {protectedEntity ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", fontSize: "0.75rem", fontWeight: 700, color: "var(--rf-destructive)" }}>
                  <ShieldAlert size={13} aria-hidden="true" />
                  Requires review, cannot auto-resolve
                </span>
              ) : null}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.9rem" }}>
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

            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
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
                <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--rf-muted-foreground)" }}>
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
    <div style={{ border: "1px solid var(--rf-border)", borderRadius: "var(--rf-radius-md)", padding: "0.65rem" }}>
      <p style={{ margin: 0, fontSize: "0.75rem", fontWeight: 700, color: "var(--rf-muted-foreground)" }}>{label}</p>
      <p style={{ margin: "0.15rem 0 0.4rem", fontSize: "0.75rem", color: "var(--rf-muted-foreground)" }}>
        {new Date(changedAt).toLocaleString()} {changedBy ? `by ${changedBy}` : ""}
      </p>
      <pre
        style={{
          margin: 0,
          fontSize: "0.75rem",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          background: "var(--rf-muted)",
          borderRadius: "var(--rf-radius-sm)",
          padding: "0.5rem",
          maxHeight: "8rem",
          overflow: "auto",
        }}
      >
        {formatValue(value)}
      </pre>
    </div>
  );
}
