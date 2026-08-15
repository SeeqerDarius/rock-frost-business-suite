/**
 * Orchestrates a full sync cycle: drain the outbound mutation queue, pull
 * cloud changes per module, apply push outcomes (applied / conflict /
 * rejected) to local state, and react to the three special-case responses
 * every call can produce — expired auth, revocation, and conflicts.
 *
 * This is the one place that decides *when* to sync (manual "Sync now",
 * and — wired by the shell, not this file — a periodic timer once online).
 * It never talks to fetch directly (that's SyncClient's job) and never
 * touches SQL (that's LocalDatabase's job).
 */

import type { LocalDatabase } from "@/db/local-database";
import type { SyncClient } from "@/sync/sync-client";
import { PUSH_BATCH_SIZE, toMutationEnvelopes } from "@/sync/mutation-queue";
import { SyncClientError, type OfflineModuleKey, type SyncPullRecord } from "@/contract/sync-contract";
import type { ConflictRecord } from "@/db/schema";

export type SyncState = "idle" | "syncing" | "offline" | "conflicts_pending" | "session_expired" | "revoked" | "error";

export interface SyncEngineStatus {
  state: SyncState;
  pendingMutationCount: number;
  openConflictCount: number;
  lastSuccessfulSyncAt: string | null;
  lastErrorMessage: string | null;
  isOnline: boolean;
}

export interface SyncEngineDeps {
  db: LocalDatabase;
  client: SyncClient;
  enabledModuleKeys: OfflineModuleKey[];
  deviceId: string;
  /** Called once, synchronously, the moment a 403 is observed on any call — see security/revocation.ts. The engine itself does not decide what "revoked" means beyond locking its own further activity; the actual purge/lock is the caller's responsibility so this module doesn't need to depend on the security layer. */
  onRevoked: () => Promise<void>;
  /** Called when a 401 is observed and this contract has no token-refresh endpoint to fall back to (see the note on ActivateDeviceResponse.refreshToken in contract/sync-contract.ts) — the caller is expected to route the user back to sign-in. */
  onSessionExpired: () => Promise<void>;
}

type Listener = (status: SyncEngineStatus) => void;

export class SyncEngine {
  private status: SyncEngineStatus = {
    state: "idle",
    pendingMutationCount: 0,
    openConflictCount: 0,
    lastSuccessfulSyncAt: null,
    lastErrorMessage: null,
    isOnline: typeof navigator === "undefined" ? true : navigator.onLine,
  };
  private listeners = new Set<Listener>();
  private syncInFlight: Promise<void> | null = null;

  constructor(private readonly deps: SyncEngineDeps) {}

  getStatus(): SyncEngineStatus {
    return this.status;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Entry point for both the manual "Sync now" button and any periodic background trigger. Safe to call while a sync is already running — callers get the in-flight sync's own completion rather than starting a second, overlapping one. */
  async syncNow(): Promise<void> {
    if (this.syncInFlight) return this.syncInFlight;
    this.syncInFlight = this.runSyncCycle().finally(() => {
      this.syncInFlight = null;
    });
    return this.syncInFlight;
  }

  async refreshPendingCounts(): Promise<void> {
    const [pending, conflicts] = await Promise.all([
      this.deps.db.countPendingMutations(),
      this.deps.db.listConflicts("open"),
    ]);
    this.updateStatus({ pendingMutationCount: pending, openConflictCount: conflicts.length });
  }

  private async runSyncCycle(): Promise<void> {
    await this.deps.db.appendAuditEvent("sync_started", { deviceId: this.deps.deviceId });
    this.updateStatus({ state: "syncing", lastErrorMessage: null });

    try {
      await this.pullAllModules();
      await this.drainQueue();
      await this.refreshPendingCounts();

      const nowIso = new Date().toISOString();
      const openConflicts = await this.deps.db.listConflicts("open");
      this.updateStatus({
        state: openConflicts.length > 0 ? "conflicts_pending" : "idle",
        lastSuccessfulSyncAt: nowIso,
        isOnline: true,
      });
      await this.deps.db.appendAuditEvent("sync_completed", { deviceId: this.deps.deviceId });
    } catch (error) {
      await this.handleSyncError(error);
    }
  }

  private async pullAllModules(): Promise<void> {
    for (const moduleKey of this.deps.enabledModuleKeys) {
      let cursor = (await this.deps.db.getSyncCursor(moduleKey)) ?? "";
      for (;;) {
        const response = await this.deps.client.callWithRetry(() => this.deps.client.pull(cursor));
        await this.applyPulledRecords(response.records);
        await this.deps.db.setSyncCursor(moduleKey, response.nextCursor);
        cursor = response.nextCursor;
        if (!response.hasMore) break;
      }
    }
  }

  private async applyPulledRecords(records: SyncPullRecord[]): Promise<void> {
    for (const record of records) {
      if (record.deleted) {
        await this.deps.db.deleteCachedRecord(record.moduleKey, record.entityType, record.entityId);
        continue;
      }
      // A cloud record for an entity with an unsent local mutation still
      // pending is intentionally NOT overwritten here — the pending flag on
      // the existing cached row is left as-is, and the queue drain below
      // (or a future conflict) is what reconciles it. Silently clobbering
      // a local pending edit with a same-cycle pull is exactly the kind of
      // implicit last-write-wins this app must not do for financial data.
      const existing = await this.deps.db.getCachedRecord(record.moduleKey, record.entityType, record.entityId);
      if (existing?.hasPendingLocalChange) continue;

      await this.deps.db.upsertCachedRecord({
        moduleKey: record.moduleKey,
        entityType: record.entityType,
        entityId: record.entityId,
        version: record.version,
        payload: record.payload,
        hasPendingLocalChange: false,
        updatedAt: record.updatedAt,
        updatedByUserId: record.updatedByUserId,
        updatedByUserName: record.updatedByUserName,
      });
    }
  }

  private async drainQueue(): Promise<void> {
    for (;;) {
      const pending = await this.deps.db.listQueuedMutations("pending");
      if (pending.length === 0) return;

      const batch = pending.slice(0, PUSH_BATCH_SIZE);
      for (const mutation of batch) {
        await this.deps.db.updateMutationStatus(mutation.mutationId, "sending", { lastAttemptAt: new Date().toISOString() });
      }

      const response = await this.deps.client.callWithRetry(() =>
        this.deps.client.push({ deviceId: this.deps.deviceId, mutations: toMutationEnvelopes(batch) }),
      );

      for (const outcome of response.outcomes) {
        await this.applyPushOutcome(outcome, batch.find((m) => m.mutationId === outcome.mutationId));
      }

      // If nothing in this batch actually moved out of "pending"/"sending"
      // (e.g. every outcome was itself missing — a malformed server
      // response), stop rather than looping forever on the same batch.
      const stillPending = await this.deps.db.listQueuedMutations("pending");
      if (stillPending.length === pending.length) return;
    }
  }

  private async applyPushOutcome(
    outcome: { mutationId: string; status: string; newVersion?: number; conflict?: unknown; rejectionReason?: string },
    mutation: { entityType: string; entityId: string; moduleKey: OfflineModuleKey; payload: unknown } | undefined,
  ): Promise<void> {
    if (outcome.status === "applied") {
      await this.deps.db.updateMutationStatus(outcome.mutationId, "applied");
      await this.deps.db.appendAuditEvent("mutation_applied", { mutationId: outcome.mutationId, newVersion: outcome.newVersion });

      if (mutation && outcome.newVersion !== undefined) {
        // Best-effort local reflection of the confirmed write using the
        // mutation's own payload as the new known-good state, so the UI can
        // immediately stop showing "Pending sync" — a subsequent pull will
        // still reconcile this with the server's authoritative payload if
        // it differs (e.g. server-computed fields).
        await this.deps.db.upsertCachedRecord({
          moduleKey: mutation.moduleKey,
          entityType: mutation.entityType,
          entityId: mutation.entityId,
          version: outcome.newVersion,
          payload: mutation.payload,
          hasPendingLocalChange: false,
          updatedAt: new Date().toISOString(),
          updatedByUserId: null,
          updatedByUserName: null,
        });
      }
      return;
    }

    if (outcome.status === "conflict" && outcome.conflict) {
      const conflict = outcome.conflict as ConflictRecord;
      await this.deps.db.updateMutationStatus(outcome.mutationId, "conflict");
      await this.deps.db.upsertConflict({ ...conflict, status: "open", detectedAt: new Date().toISOString(), resolvedAt: null, resolvedWith: null });
      await this.deps.db.appendAuditEvent("conflict_detected", { mutationId: outcome.mutationId, conflictId: conflict.conflictId });
      return;
    }

    // "rejected"
    await this.deps.db.updateMutationStatus(outcome.mutationId, "rejected", { rejectionReason: outcome.rejectionReason ?? "Rejected by server." });
    await this.deps.db.appendAuditEvent("mutation_rejected", { mutationId: outcome.mutationId, reason: outcome.rejectionReason });
  }

  private async handleSyncError(error: unknown): Promise<void> {
    if (error instanceof SyncClientError) {
      if (error.kind === "revoked_or_unauthorized") {
        this.updateStatus({ state: "revoked", lastErrorMessage: error.message });
        await this.deps.onRevoked();
        return;
      }
      if (error.kind === "expired_auth") {
        this.updateStatus({ state: "session_expired", lastErrorMessage: error.message });
        await this.deps.onSessionExpired();
        return;
      }
      if (error.kind === "network_error") {
        this.updateStatus({ state: "offline", isOnline: false, lastErrorMessage: error.message });
        return;
      }
      this.updateStatus({ state: "error", lastErrorMessage: error.message });
      return;
    }

    this.updateStatus({ state: "error", lastErrorMessage: error instanceof Error ? error.message : "Unknown sync error." });
  }

  private updateStatus(patch: Partial<SyncEngineStatus>): void {
    this.status = { ...this.status, ...patch };
    for (const listener of this.listeners) listener(this.status);
  }
}
