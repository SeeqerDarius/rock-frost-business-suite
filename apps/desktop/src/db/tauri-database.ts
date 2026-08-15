import { invoke } from "@tauri-apps/api/core";
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

/**
 * Production {@link LocalDatabase} implementation. Every method is exactly
 * one `invoke()` call into a Rust command defined in
 * src-tauri/src/commands.rs, which is the only code in the whole
 * application that opens the encrypted SQLite connection (see
 * src-tauri/src/db.rs). No SQL string, table name, or encryption key is
 * ever constructed or held in this TypeScript process — that boundary is
 * the entire point of this file being a thin, typed pass-through rather
 * than a query builder.
 *
 * IMPORTANT: this file's command names and argument shapes must stay in
 * lockstep with src-tauri/src/commands.rs. This has not been exercised
 * against a compiled Tauri binary in this environment (no Rust toolchain
 * was available — see apps/desktop/CLAUDE_HANDOFF.md) and must be smoke
 * tested end-to-end before this is relied on for a release build.
 */
export class TauriLocalDatabase implements LocalDatabase {
  async getActiveDevice(): Promise<DeviceRecord | null> {
    return invoke<DeviceRecord | null>("db_get_active_device");
  }

  async saveDevice(device: DeviceRecord): Promise<void> {
    await invoke("db_save_device", { device });
  }

  async deactivateDevice(deviceId: string, reason: NonNullable<DeviceRecord["deactivationReason"]>): Promise<void> {
    await invoke("db_deactivate_device", { deviceId, reason });
  }

  async getCachedRecord(moduleKey: OfflineModuleKey, entityType: string, entityId: string): Promise<CachedRecord | null> {
    return invoke<CachedRecord | null>("db_get_cached_record", { moduleKey, entityType, entityId });
  }

  async listCachedRecords(moduleKey: OfflineModuleKey, entityType: string): Promise<CachedRecord[]> {
    return invoke<CachedRecord[]>("db_list_cached_records", { moduleKey, entityType });
  }

  async upsertCachedRecord(record: CachedRecord): Promise<void> {
    await invoke("db_upsert_cached_record", { record });
  }

  async deleteCachedRecord(moduleKey: OfflineModuleKey, entityType: string, entityId: string): Promise<void> {
    await invoke("db_delete_cached_record", { moduleKey, entityType, entityId });
  }

  async purgeAllCachedRecords(): Promise<void> {
    await invoke("db_purge_all_cached_records");
  }

  async enqueueMutation(
    mutation: Omit<QueuedMutationRecord, "id" | "status" | "attemptCount" | "lastAttemptAt" | "rejectionReason">,
  ): Promise<QueuedMutationRecord> {
    return invoke<QueuedMutationRecord>("db_enqueue_mutation", { mutation });
  }

  async listQueuedMutations(status?: QueuedMutationStatus): Promise<QueuedMutationRecord[]> {
    return invoke<QueuedMutationRecord[]>("db_list_queued_mutations", { status: status ?? null });
  }

  async getQueuedMutationByMutationId(mutationId: string): Promise<QueuedMutationRecord | null> {
    return invoke<QueuedMutationRecord | null>("db_get_queued_mutation", { mutationId });
  }

  async updateMutationStatus(
    mutationId: string,
    status: QueuedMutationStatus,
    fields?: { attemptCount?: number; lastAttemptAt?: string; rejectionReason?: string | null },
  ): Promise<void> {
    await invoke("db_update_mutation_status", { mutationId, status, fields: fields ?? {} });
  }

  async countPendingMutations(): Promise<number> {
    return invoke<number>("db_count_pending_mutations");
  }

  async getSyncCursor(moduleKey: OfflineModuleKey): Promise<SyncCursor | null> {
    return invoke<SyncCursor | null>("db_get_sync_cursor", { moduleKey });
  }

  async setSyncCursor(moduleKey: OfflineModuleKey, cursor: SyncCursor): Promise<void> {
    await invoke("db_set_sync_cursor", { moduleKey, cursor });
  }

  async upsertConflict(conflict: ConflictRecord): Promise<void> {
    await invoke("db_upsert_conflict", { conflict });
  }

  async listConflicts(status?: ConflictStatus): Promise<ConflictRecord[]> {
    return invoke<ConflictRecord[]>("db_list_conflicts", { status: status ?? null });
  }

  async getConflict(conflictId: string): Promise<ConflictRecord | null> {
    return invoke<ConflictRecord | null>("db_get_conflict", { conflictId });
  }

  async resolveConflict(conflictId: string, resolvedWith: string): Promise<void> {
    await invoke("db_resolve_conflict", { conflictId, resolvedWith });
  }

  async appendAuditEvent(eventType: AuditEventType, details: Record<string, unknown>): Promise<void> {
    await invoke("db_append_audit_event", { eventType, details });
  }

  async listAuditEvents(limit = 200): Promise<AuditEventRecord[]> {
    return invoke<AuditEventRecord[]>("db_list_audit_events", { limit });
  }

  async resetAll(): Promise<void> {
    await invoke("db_reset_all");
  }
}
