import type { LocalDatabase } from "@/db/local-database";
import type { SyncClient } from "@/sync/sync-client";
import { PUSH_BATCH_SIZE, toMutationEnvelopes } from "@/sync/mutation-queue";
import { SyncClientError, type MutationOutcome, type OfflineModuleKey } from "@/contract/sync-contract";
import type { ConflictRecord, QueuedMutationRecord } from "@/db/schema";

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
  onRevoked: () => Promise<void>;
  onSessionExpired: () => Promise<void>;
}

type Listener = (status: SyncEngineStatus) => void;

export class SyncEngine {
  private status: SyncEngineStatus = {
    state: "idle", pendingMutationCount: 0, openConflictCount: 0,
    lastSuccessfulSyncAt: null, lastErrorMessage: null,
    isOnline: typeof navigator === "undefined" ? true : navigator.onLine,
  };
  private listeners = new Set<Listener>();
  private syncInFlight: Promise<void> | null = null;
  constructor(private readonly deps: SyncEngineDeps) {}
  getStatus() { return this.status; }
  subscribe(listener: Listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  async syncNow(): Promise<void> {
    if (this.syncInFlight) return this.syncInFlight;
    this.syncInFlight = this.runSyncCycle().finally(() => { this.syncInFlight = null; });
    return this.syncInFlight;
  }
  async refreshPendingCounts() {
    const [pending, conflicts] = await Promise.all([this.deps.db.countPendingMutations(), this.deps.db.listConflicts("open")]);
    this.updateStatus({ pendingMutationCount: pending, openConflictCount: conflicts.length });
  }
  private async runSyncCycle() {
    await this.deps.db.appendAuditEvent("sync_started", { deviceId: this.deps.deviceId });
    this.updateStatus({ state: "syncing", lastErrorMessage: null });
    try {
      await this.pullSnapshot();
      await this.drainQueue();
      await this.refreshPendingCounts();
      const conflicts = await this.deps.db.listConflicts("open");
      const now = new Date().toISOString();
      this.updateStatus({ state: conflicts.length ? "conflicts_pending" : "idle", lastSuccessfulSyncAt: now, isOnline: true });
      await this.deps.db.appendAuditEvent("sync_completed", { deviceId: this.deps.deviceId });
    } catch (error) { await this.handleSyncError(error); }
  }
  /**
   * The pull response is a flat row list (one row per entity, not one
   * blob per module), each already scoped/authorized server-side - see
   * OfflineSnapshotRow in contract/sync-contract.ts. One CachedRecord per
   * row means db.listCachedRecords(moduleKey, entityType) returns real,
   * individually queryable entities, which is what a real per-entity list
   * or detail screen needs.
   */
  private async pullSnapshot() {
    const response = await this.deps.client.callWithRetry(() => this.deps.client.pull());
    await this.persistOfflineAuthorization(response.offlineAccessUntil, response.generatedAt);
    for (const row of response.rows) {
      const moduleKey = row.entityType.split(".")[0] as OfflineModuleKey;
      await this.deps.db.upsertCachedRecord({
        moduleKey, entityType: row.entityType, entityId: row.entityId, version: row.version, payload: row.payload,
        hasPendingLocalChange: false, updatedAt: response.generatedAt,
        updatedByUserId: null, updatedByUserName: null,
      });
    }
    // Cursor is set per module this device is authorized for, independent
    // of whether that module happened to have any rows this pull - same
    // as the enabledModuleKeys-driven behavior before decomposition.
    for (const moduleKey of this.deps.enabledModuleKeys) {
      await this.deps.db.setSyncCursor(moduleKey, response.generatedAt);
    }
  }
  private async drainQueue() {
    for (;;) {
      const pending = await this.deps.db.listQueuedMutations("pending");
      if (!pending.length) return;
      const batch = pending.slice(0, PUSH_BATCH_SIZE);
      for (const mutation of batch) await this.deps.db.updateMutationStatus(mutation.mutationId, "sending", { lastAttemptAt: new Date().toISOString() });
      const response = await this.deps.client.callWithRetry(() => this.deps.client.push({ mutations: toMutationEnvelopes(batch) }));
      await this.persistOfflineAuthorization(response.offlineAccessUntil, new Date().toISOString());
      for (const result of response.results) await this.applyPushResult(result, batch.find((item) => item.mutationId === result.mutationId));
      const returnedIds = new Set(response.results.map((result) => result.mutationId));
      for (const mutation of batch) {
        if (!returnedIds.has(mutation.mutationId)) await this.deps.db.updateMutationStatus(mutation.mutationId, "pending");
      }
      const remaining = await this.deps.db.listQueuedMutations("pending");
      if (remaining.length === pending.length) return;
    }
  }
  private async persistOfflineAuthorization(offlineAccessUntil: string, updatedAt: string) {
    const moduleKey = this.deps.enabledModuleKeys[0];
    if (!moduleKey) return;
    await this.deps.db.upsertCachedRecord({
      moduleKey, entityType: `${moduleKey}.offline_authorization`, entityId: this.deps.deviceId,
      version: 0, payload: { offlineAccessUntil }, hasPendingLocalChange: false, updatedAt,
      updatedByUserId: null, updatedByUserName: null,
    });
  }
  private async applyPushResult(outcome: MutationOutcome, mutation?: QueuedMutationRecord) {
    if (outcome.status === "applied") {
      await this.deps.db.updateMutationStatus(outcome.mutationId, "applied");
      await this.deps.db.appendAuditEvent("mutation_applied", { mutationId: outcome.mutationId, result: outcome.result });
      if (mutation) await this.deps.db.upsertCachedRecord({
        moduleKey: mutation.moduleKey, entityType: mutation.entityType, entityId: mutation.entityId,
        version: 0, payload: mutation.payload, hasPendingLocalChange: false,
        updatedAt: new Date().toISOString(), updatedByUserId: null, updatedByUserName: null,
      });
      return;
    }
    if (outcome.status === "processing") {
      await this.deps.db.updateMutationStatus(outcome.mutationId, "pending", { rejectionReason: null });
      return;
    }
    if (outcome.status === "conflict") {
      const now = new Date().toISOString();
      const conflictId = typeof outcome.result?.conflictId === "string" ? outcome.result.conflictId : `mutation:${outcome.mutationId}`;
      const allowedResolutions = Array.isArray(outcome.result?.allowedResolutions)
        ? outcome.result.allowedResolutions.filter((value): value is string => typeof value === "string")
        : [];
      const conflict: ConflictRecord = {
        conflictId, moduleKey: mutation?.moduleKey ?? "fleet",
        entityType: mutation?.entityType ?? "unknown", entityId: mutation?.entityId ?? outcome.mutationId,
        allowedResolutions, localValue: mutation?.payload ?? null, localChangedAt: now,
        localChangedByUserName: null, cloudValue: outcome.result, cloudChangedAt: now,
        cloudChangedByUserName: null, status: "open", detectedAt: now, resolvedAt: null, resolvedWith: null,
      };
      await this.deps.db.updateMutationStatus(outcome.mutationId, "conflict");
      await this.deps.db.upsertConflict(conflict);
      await this.deps.db.appendAuditEvent("conflict_detected", { mutationId: outcome.mutationId, errorCode: outcome.errorCode });
      return;
    }
    await this.deps.db.updateMutationStatus(outcome.mutationId, "rejected", { rejectionReason: outcome.errorCode ?? "Rejected by server." });
    await this.deps.db.appendAuditEvent("mutation_rejected", { mutationId: outcome.mutationId, reason: outcome.errorCode });
  }
  private async handleSyncError(error: unknown) {
    if (error instanceof SyncClientError) {
      if (error.kind === "revoked_or_unauthorized") { this.updateStatus({ state: "revoked", lastErrorMessage: error.message }); await this.deps.onRevoked(); return; }
      if (error.kind === "expired_auth") { this.updateStatus({ state: "session_expired", lastErrorMessage: error.message }); await this.deps.onSessionExpired(); return; }
      if (error.kind === "network_error") { this.updateStatus({ state: "offline", isOnline: false, lastErrorMessage: error.message }); return; }
      this.updateStatus({ state: "error", lastErrorMessage: error.message }); return;
    }
    this.updateStatus({ state: "error", lastErrorMessage: error instanceof Error ? error.message : "Unknown sync error." });
  }
  private updateStatus(patch: Partial<SyncEngineStatus>) {
    this.status = { ...this.status, ...patch };
    for (const listener of this.listeners) listener(this.status);
  }
}
