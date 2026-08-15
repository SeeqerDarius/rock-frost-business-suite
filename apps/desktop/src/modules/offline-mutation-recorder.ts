/**
 * Shared foundation every module adapter (fleet/, installment/, pos/,
 * inventory/) is built on. This is the ONE place that writes to both the
 * mutation queue and the cached-record table for a new offline write, so
 * the "never look cloud-confirmed before server acknowledgement" rule
 * (required for financial records especially, but applied uniformly here)
 * cannot be accidentally skipped by an individual adapter.
 */

import type { LocalDatabase } from "@/db/local-database";
import { enqueueMutation } from "@/sync/mutation-queue";
import type { MutationOperation, OfflineModuleKey } from "@/contract/sync-contract";
import type { CachedRecord } from "@/db/schema";

export interface RecordOfflineMutationInput {
  db: LocalDatabase;
  organizationId: string;
  moduleKey: OfflineModuleKey;
  entityType: string;
  entityId: string;
  operation: MutationOperation;
  payload: unknown;
  /** The version this write was based on (from the last known cached record) — null for a brand-new, offline-created entity. */
  baseVersion: number | null;
  /** Who made this change, for display in the cached record before the server assigns its own audit identity — never sent as part of the mutation envelope itself (the server derives the acting user from the authenticated session). */
  actingUserName: string | null;
}

/**
 * Queues the mutation and immediately reflects it in the local cache with
 * `hasPendingLocalChange: true`. Every module adapter's "record a new
 * offline X" function is a thin, typed wrapper around this — never a
 * direct `db.enqueueMutation` / `db.upsertCachedRecord` pair, so this
 * invariant can't drift per module.
 */
export async function recordOfflineMutation(input: RecordOfflineMutationInput): Promise<void> {
  const changedAt = new Date().toISOString();

  await enqueueMutation(input.db, {
    organizationId: input.organizationId,
    moduleKey: input.moduleKey,
    entityType: input.entityType,
    entityId: input.entityId,
    baseVersion: input.baseVersion,
    operation: input.operation,
    payload: input.payload,
    changedAt,
  });

  if (input.operation === "delete") {
    // A locally-recorded delete still needs the record visible (as
    // pending) until the server confirms it — module adapters that support
    // offline delete would need a richer "pending delete" cache shape than
    // this pass builds; none of the four shipped adapters emit one yet
    // (see contract/sync-contract.ts's MutationOperation doc comment).
    return;
  }

  const existing: CachedRecord | null = await input.db.getCachedRecord(input.moduleKey, input.entityType, input.entityId);
  await input.db.upsertCachedRecord({
    moduleKey: input.moduleKey,
    entityType: input.entityType,
    entityId: input.entityId,
    version: existing?.version ?? 0,
    payload: input.payload,
    hasPendingLocalChange: true,
    updatedAt: changedAt,
    updatedByUserId: null,
    updatedByUserName: input.actingUserName,
  });
}
