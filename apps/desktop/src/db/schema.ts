/**
 * Local, device-side data model. Every row here lives only inside the
 * encrypted on-device SQLite database (see src-tauri/src/db.rs): none of
 * these tables, or their names, are shared with or dictated by the cloud
 * schema Codex owns. The desktop client never connects to Neon/PostgreSQL
 * directly; everything it knows comes through the sync contract in
 * src/contract/sync-contract.ts.
 */

import type { MutationOperation, OfflineModuleKey, SyncCursor } from "@/contract/sync-contract";

/** One row per activated installation. In practice there is exactly one active row at a time (a signed-out device clears it), but it's modeled as a table so device history/audit survives a re-activation. */
export interface DeviceRecord {
  deviceId: string;
  deviceName: string;
  organizationId: string;
  userId: string;
  userName: string;
  enabledModuleKeys: OfflineModuleKey[];
  activatedAt: string;
  /** Set the moment a 403 revoked_or_unauthorized response is received, or the user explicitly signs out. A device with this set must never sync or unlock again without re-activation. */
  deactivatedAt: string | null;
  deactivationReason: "revoked_by_server" | "user_signed_out" | "session_expired_offline" | null;
}

/**
 * A cached, cloud-authoritative business record last seen from a pull.
 * Keyed by (moduleKey, entityType, entityId): one row per entity, holding
 * only the latest known state, never a history.
 */
export interface CachedRecord {
  moduleKey: OfflineModuleKey;
  entityType: string;
  entityId: string;
  version: number;
  payload: unknown;
  /** True once a local queued mutation against this entity hasn't been confirmed applied by the server yet: the UI must never present this record's fields as cloud-confirmed while true. */
  hasPendingLocalChange: boolean;
  updatedAt: string;
  updatedByUserId: string | null;
  updatedByUserName: string | null;
}

export type QueuedMutationStatus = "pending" | "sending" | "applied" | "conflict" | "rejected";

/**
 * One row per offline mutation, in the exact order it was recorded: this
 * order is the queue's contract. `mutationId` is the idempotency key
 * (see src/sync/mutation-queue.ts) and is therefore also this table's
 * natural unique key, even though `id` (an autoincrement-style local
 * sequence) is what actually enforces FIFO ordering, since two mutations
 * recorded in the same millisecond would otherwise be unorderable by
 * `changedAt` alone.
 */
export interface QueuedMutationRecord {
  /** Monotonically increasing local sequence number: the true ordering key. Assigned by the local database on insert, never by the client in memory, so ordering survives an app restart mid-queue. */
  id: number;
  mutationId: string;
  organizationId: string;
  moduleKey: OfflineModuleKey;
  entityType: string;
  entityId: string;
  baseVersion: 0;
  operation: MutationOperation;
  changedAt: string;
  payload: unknown;
  status: QueuedMutationStatus;
  attemptCount: number;
  lastAttemptAt: string | null;
  /** Set only when status is "rejected": the server's rejectionReason, kept for the audit trail and any manual support follow-up. */
  rejectionReason: string | null;
}

/** One row per module the device syncs, tracking the pull cursor independently per module so a partial/interrupted sync of one module never blocks or corrupts another's progress. */
export interface SyncCursorRecord {
  moduleKey: OfflineModuleKey;
  cursor: SyncCursor;
  updatedAt: string;
}

export type ConflictStatus = "open" | "resolved";

/** A locally-cached copy of a conflict the server reported (via a push outcome), so the conflict experience can render offline and the user's chosen resolution can itself be queued/retried like any other outbound call. */
export interface ConflictRecord {
  conflictId: string;
  moduleKey: OfflineModuleKey;
  entityType: string;
  entityId: string;
  allowedResolutions: string[];
  localValue: unknown;
  localChangedAt: string;
  localChangedByUserName: string | null;
  cloudValue: unknown;
  cloudChangedAt: string;
  cloudChangedByUserName: string | null;
  status: ConflictStatus;
  detectedAt: string;
  resolvedAt: string | null;
  resolvedWith: string | null;
}

export type AuditEventType =
  | "device_activated"
  | "device_deactivated"
  | "device_locked"
  | "device_unlocked"
  | "session_expired_offline"
  | "sync_started"
  | "sync_completed"
  | "sync_failed"
  | "mutation_queued"
  | "mutation_applied"
  | "mutation_rejected"
  | "conflict_detected"
  | "conflict_resolved"
  | "revocation_received"
  | "protected_data_purged";

/**
 * Local, append-only audit trail. This is a device-local operational log
 * for support/debugging and for proving to the user what happened to their
 * offline work: it is not, and does not replace, the server's own audit
 * log for the entities it authoritatively owns.
 */
export interface AuditEventRecord {
  id: number;
  eventType: AuditEventType;
  occurredAt: string;
  details: Record<string, unknown>;
}
