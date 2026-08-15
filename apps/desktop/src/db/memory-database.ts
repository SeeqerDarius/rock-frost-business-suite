import type { LocalDatabase } from "@/db/local-database";
import type {
  AuditEventRecord,
  AuditEventType,
  CachedRecord,
  ConflictRecord,
  ConflictStatus,
  DeviceRecord,
  QueuedMutationRecord,
  QueuedMutationStatus,
} from "@/db/schema";
import type { OfflineModuleKey, SyncCursor } from "@/contract/sync-contract";

function cacheKey(moduleKey: OfflineModuleKey, entityType: string, entityId: string): string {
  return `${moduleKey}:${entityType}:${entityId}`;
}

/**
 * In-memory implementation of {@link LocalDatabase}. Used by:
 *  - The unit test suite (fast, no native SQLite required to test queue
 *    ordering, cursor handling, revocation, etc.).
 *  - `npm run dev` in a plain browser preview, where there is no Tauri
 *    runtime to invoke into. This is explicitly a development convenience,
 *    never used for a real activated device: see AppProviders in
 *    src/App.tsx, which selects TauriLocalDatabase whenever
 *    `window.__TAURI_INTERNALS__` is present.
 *
 * Data does not survive a reload. That is intentional here, not a bug -
 * persistence is the one thing this implementation deliberately does not
 * attempt to fake.
 */
export class MemoryLocalDatabase implements LocalDatabase {
  private device: DeviceRecord | null = null;
  private cachedRecords = new Map<string, CachedRecord>();
  private mutations: QueuedMutationRecord[] = [];
  private nextMutationId = 1;
  private cursors = new Map<OfflineModuleKey, SyncCursor>();
  private conflicts = new Map<string, ConflictRecord>();
  private auditEvents: AuditEventRecord[] = [];
  private nextAuditId = 1;

  async getActiveDevice(): Promise<DeviceRecord | null> {
    return this.device;
  }

  async saveDevice(device: DeviceRecord): Promise<void> {
    this.device = { ...device };
  }

  async deactivateDevice(deviceId: string, reason: NonNullable<DeviceRecord["deactivationReason"]>): Promise<void> {
    if (this.device && this.device.deviceId === deviceId) {
      this.device = { ...this.device, deactivatedAt: new Date().toISOString(), deactivationReason: reason };
    }
  }

  async getCachedRecord(moduleKey: OfflineModuleKey, entityType: string, entityId: string): Promise<CachedRecord | null> {
    return this.cachedRecords.get(cacheKey(moduleKey, entityType, entityId)) ?? null;
  }

  async listCachedRecords(moduleKey: OfflineModuleKey, entityType: string): Promise<CachedRecord[]> {
    return [...this.cachedRecords.values()].filter((r) => r.moduleKey === moduleKey && r.entityType === entityType);
  }

  async upsertCachedRecord(record: CachedRecord): Promise<void> {
    this.cachedRecords.set(cacheKey(record.moduleKey, record.entityType, record.entityId), { ...record });
  }

  async deleteCachedRecord(moduleKey: OfflineModuleKey, entityType: string, entityId: string): Promise<void> {
    this.cachedRecords.delete(cacheKey(moduleKey, entityType, entityId));
  }

  async purgeAllCachedRecords(): Promise<void> {
    this.cachedRecords.clear();
  }

  async enqueueMutation(
    mutation: Omit<QueuedMutationRecord, "id" | "status" | "attemptCount" | "lastAttemptAt" | "rejectionReason">,
  ): Promise<QueuedMutationRecord> {
    const existing = this.mutations.find((m) => m.mutationId === mutation.mutationId);
    if (existing) return existing;

    const record: QueuedMutationRecord = {
      ...mutation,
      id: this.nextMutationId++,
      status: "pending",
      attemptCount: 0,
      lastAttemptAt: null,
      rejectionReason: null,
    };
    this.mutations.push(record);
    return record;
  }

  async listQueuedMutations(status?: QueuedMutationStatus): Promise<QueuedMutationRecord[]> {
    const filtered = status ? this.mutations.filter((m) => m.status === status) : [...this.mutations];
    return filtered.sort((a, b) => a.id - b.id);
  }

  async getQueuedMutationByMutationId(mutationId: string): Promise<QueuedMutationRecord | null> {
    return this.mutations.find((m) => m.mutationId === mutationId) ?? null;
  }

  async updateMutationStatus(
    mutationId: string,
    status: QueuedMutationStatus,
    fields?: { attemptCount?: number; lastAttemptAt?: string; rejectionReason?: string | null },
  ): Promise<void> {
    const record = this.mutations.find((m) => m.mutationId === mutationId);
    if (!record) return;
    record.status = status;
    if (fields?.attemptCount !== undefined) record.attemptCount = fields.attemptCount;
    if (fields?.lastAttemptAt !== undefined) record.lastAttemptAt = fields.lastAttemptAt;
    if (fields?.rejectionReason !== undefined) record.rejectionReason = fields.rejectionReason;
  }

  async countPendingMutations(): Promise<number> {
    return this.mutations.filter((m) => m.status === "pending" || m.status === "sending").length;
  }

  async getSyncCursor(moduleKey: OfflineModuleKey): Promise<SyncCursor | null> {
    return this.cursors.get(moduleKey) ?? null;
  }

  async setSyncCursor(moduleKey: OfflineModuleKey, cursor: SyncCursor): Promise<void> {
    this.cursors.set(moduleKey, cursor);
  }

  async upsertConflict(conflict: ConflictRecord): Promise<void> {
    this.conflicts.set(conflict.conflictId, { ...conflict });
  }

  async listConflicts(status?: ConflictStatus): Promise<ConflictRecord[]> {
    const all = [...this.conflicts.values()];
    return status ? all.filter((c) => c.status === status) : all;
  }

  async getConflict(conflictId: string): Promise<ConflictRecord | null> {
    return this.conflicts.get(conflictId) ?? null;
  }

  async resolveConflict(conflictId: string, resolvedWith: string): Promise<void> {
    const conflict = this.conflicts.get(conflictId);
    if (!conflict) return;
    conflict.status = "resolved";
    conflict.resolvedAt = new Date().toISOString();
    conflict.resolvedWith = resolvedWith;
  }

  async appendAuditEvent(eventType: AuditEventType, details: Record<string, unknown>): Promise<void> {
    this.auditEvents.push({ id: this.nextAuditId++, eventType, occurredAt: new Date().toISOString(), details });
  }

  async listAuditEvents(limit = 200): Promise<AuditEventRecord[]> {
    return [...this.auditEvents].sort((a, b) => b.id - a.id).slice(0, limit);
  }

  async resetAll(): Promise<void> {
    this.device = null;
    this.cachedRecords.clear();
    this.mutations = [];
    this.nextMutationId = 1;
    this.cursors.clear();
    this.conflicts.clear();
    this.auditEvents = [];
    this.nextAuditId = 1;
  }
}
