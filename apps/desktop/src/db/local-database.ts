/**
 * The storage abstraction every other layer (sync engine, module adapters,
 * shell UI) programs against. Two implementations exist:
 *
 *  - TauriLocalDatabase (tauri-database.ts): the real, production
 *    implementation: every method is a single typed `invoke()` call into
 *    the Rust side (src-tauri/src/db.rs), which is the only code that ever
 *    touches the encrypted SQLite file. No SQL, and no encryption key,
 *    exists anywhere in the TypeScript/webview process.
 *  - MemoryLocalDatabase (memory-database.ts): an in-memory implementation
 *    used by unit tests and by `npm run dev` when running in a plain
 *    browser preview outside the Tauri shell (no native SQLite available
 *    there at all). It is never used for a real activated device.
 *
 * Every method is async even where an in-memory implementation could be
 * synchronous, so the interface honestly reflects that the real
 * implementation always crosses an IPC boundary.
 */

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

export interface LocalDatabase {
  // --- Device metadata ---
  getActiveDevice(): Promise<DeviceRecord | null>;
  saveDevice(device: DeviceRecord): Promise<void>;
  deactivateDevice(deviceId: string, reason: NonNullable<DeviceRecord["deactivationReason"]>): Promise<void>;

  // --- Cached business records ---
  getCachedRecord(moduleKey: OfflineModuleKey, entityType: string, entityId: string): Promise<CachedRecord | null>;
  listCachedRecords(moduleKey: OfflineModuleKey, entityType: string): Promise<CachedRecord[]>;
  upsertCachedRecord(record: CachedRecord): Promise<void>;
  deleteCachedRecord(moduleKey: OfflineModuleKey, entityType: string, entityId: string): Promise<void>;
  /** Used by the revocation flow to remove every cached business record for every module in one atomic sweep: see src/security/revocation.ts. */
  purgeAllCachedRecords(): Promise<void>;

  // --- Mutation queue ---
  enqueueMutation(mutation: Omit<QueuedMutationRecord, "id" | "status" | "attemptCount" | "lastAttemptAt" | "rejectionReason">): Promise<QueuedMutationRecord>;
  /** Returns queued mutations in FIFO order (by the local sequence id, never by changedAt or wall-clock time: see schema.ts). */
  listQueuedMutations(status?: QueuedMutationStatus): Promise<QueuedMutationRecord[]>;
  getQueuedMutationByMutationId(mutationId: string): Promise<QueuedMutationRecord | null>;
  updateMutationStatus(
    mutationId: string,
    status: QueuedMutationStatus,
    fields?: { attemptCount?: number; lastAttemptAt?: string; rejectionReason?: string | null },
  ): Promise<void>;
  countPendingMutations(): Promise<number>;

  // --- Sync cursors ---
  getSyncCursor(moduleKey: OfflineModuleKey): Promise<SyncCursor | null>;
  setSyncCursor(moduleKey: OfflineModuleKey, cursor: SyncCursor): Promise<void>;

  // --- Conflicts ---
  upsertConflict(conflict: ConflictRecord): Promise<void>;
  listConflicts(status?: ConflictStatus): Promise<ConflictRecord[]>;
  getConflict(conflictId: string): Promise<ConflictRecord | null>;
  resolveConflict(conflictId: string, resolvedWith: string): Promise<void>;

  // --- Audit trail ---
  appendAuditEvent(eventType: AuditEventType, details: Record<string, unknown>): Promise<void>;
  listAuditEvents(limit?: number): Promise<AuditEventRecord[]>;

  // --- Lifecycle ---
  /** Wipes every table. Used by the revocation flow (after purging cached business data specifically is not enough: a full reset is used when the device itself is being fully deactivated) and by tests. */
  resetAll(): Promise<void>;
}
