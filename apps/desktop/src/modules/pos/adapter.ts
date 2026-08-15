import type { LocalDatabase } from "@/db/local-database";
import { recordOfflineMutation } from "@/modules/offline-mutation-recorder";
import { POS_ENTITY_TYPES, type PosOfflineReceiptPayload, type PosOfflineSalePayload } from "@/modules/pos/types";

export interface PosAdapterContext {
  db: LocalDatabase;
  organizationId: string;
  actingUserName: string | null;
}

/** Both entity types here are financial — see installment/adapter.ts's doc comment; the same rule applies. */
export function createPosAdapter(ctx: PosAdapterContext) {
  return {
    async recordOfflineSale(entityId: string, payload: PosOfflineSalePayload): Promise<void> {
      await recordOfflineMutation({
        db: ctx.db,
        organizationId: ctx.organizationId,
        moduleKey: "pos",
        entityType: POS_ENTITY_TYPES.OFFLINE_SALE,
        entityId,
        operation: "create",
        baseVersion: null,
        payload,
        actingUserName: ctx.actingUserName,
      });
    },

    async recordOfflineReceipt(entityId: string, payload: PosOfflineReceiptPayload): Promise<void> {
      await recordOfflineMutation({
        db: ctx.db,
        organizationId: ctx.organizationId,
        moduleKey: "pos",
        entityType: POS_ENTITY_TYPES.OFFLINE_RECEIPT,
        entityId,
        operation: "create",
        baseVersion: null,
        payload,
        actingUserName: ctx.actingUserName,
      });
    },
  };
}

export type PosAdapter = ReturnType<typeof createPosAdapter>;
