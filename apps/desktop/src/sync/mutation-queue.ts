/**
 * Idempotency-key generation and FIFO queue helpers for outbound
 * mutations. The ordering guarantee this module exists to protect: two
 * mutations against the same entity must reach the server in the order
 * they were made locally, and retrying a mutation that already reached the
 * server (but whose response was lost to a network failure) must never
 * apply twice.
 */

import type { LocalDatabase } from "@/db/local-database";
import type { MutationOperation, MutationEnvelope, OfflineEntityType, OfflineModuleKey } from "@/contract/sync-contract";
import type { QueuedMutationRecord } from "@/db/schema";

/**
 * A mutationId is generated exactly once, at the moment a mutation is
 * first recorded locally (module adapters call this, never the sync
 * engine): and is then reused for every retry of that same logical
 * mutation. Random (crypto.randomUUID), not content-derived: two
 * genuinely-identical edits made seconds apart by the same user are two
 * different mutations, not duplicates to be merged.
 */
export function createMutationId(): string {
  return crypto.randomUUID();
}

export interface EnqueueMutationInput {
  organizationId: string;
  moduleKey: OfflineModuleKey;
  entityType: OfflineEntityType;
  entityId: string;
  baseVersion: 0;
  operation: MutationOperation;
  payload: unknown;
  /** Injectable for tests; defaults to now. */
  changedAt?: string;
  /** Injectable for tests; defaults to a fresh createMutationId(). */
  mutationId?: string;
}

/**
 * Records a new outbound mutation. Safe to call multiple times with the
 * same explicit `mutationId` (e.g. a caller-level retry): enqueueMutation
 * on LocalDatabase is itself idempotent on mutationId, see
 * memory-database.ts / the db_enqueue_mutation Rust command.
 */
export async function enqueueMutation(db: LocalDatabase, input: EnqueueMutationInput): Promise<QueuedMutationRecord> {
  const record = await db.enqueueMutation({
    mutationId: input.mutationId ?? createMutationId(),
    organizationId: input.organizationId,
    moduleKey: input.moduleKey,
    entityType: input.entityType,
    entityId: input.entityId,
    baseVersion: input.baseVersion,
    operation: input.operation,
    changedAt: input.changedAt ?? new Date().toISOString(),
    payload: input.payload,
  });
  await db.appendAuditEvent("mutation_queued", {
    mutationId: record.mutationId,
    moduleKey: record.moduleKey,
    entityType: record.entityType as OfflineEntityType,
    entityId: record.entityId,
    operation: record.operation,
  });
  return record;
}

/**
 * Converts a batch of queued rows (already in FIFO order, per
 * LocalDatabase.listQueuedMutations) into the wire shape SyncPushRequest
 * expects. A pure mapping: no ordering or filtering decisions belong
 * here, those live in sync-engine.ts so they stay testable independent of
 * this shape conversion.
 */
export function toMutationEnvelopes(records: QueuedMutationRecord[]): MutationEnvelope[] {
  return records.map((record) => ({
    organizationId: record.organizationId,
    moduleKey: record.moduleKey,
    entityType: record.entityType as OfflineEntityType,
    entityId: record.entityId,
    mutationId: record.mutationId,
    baseVersion: 0,
    operation: "CREATE",
    changedAt: record.changedAt,
    payload: record.payload as Record<string, unknown>,
  }));
}

/** Bounded batch size for a single push request: the queue drains across multiple requests rather than one unbounded payload, so a large offline backlog can't produce an oversized request or a single all-or-nothing failure. */
export const PUSH_BATCH_SIZE = 50;
