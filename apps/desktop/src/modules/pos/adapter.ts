import type { LocalDatabase } from "@/db/local-database";
import { recordOfflineMutation } from "@/modules/offline-mutation-recorder";
import {
  POS_ENTITY_TYPES,
  POS_SETTINGS_ENTITY_ID,
  type PosSalePayload,
  type PosRegisterPayload,
  type PosSessionOpenPayload,
  type PosSessionClosePayload,
  type PosSaleRefundPayload,
  type PosReceiptFooterPayload,
  type PosSalePrefixPayload,
} from "@/modules/pos/types";

export interface PosAdapterContext { db: LocalDatabase; organizationId: string; actingUserName: string | null }

/**
 * Every function here is a thin, typed wrapper around recordOfflineMutation
 * (see offline-mutation-recorder.ts): the queue write and the optimistic
 * cache write always happen together, for every one of POS's 7 offline
 * actions, including the ones normally kept online-only elsewhere (refund,
 * settings) - POS is the approved no-exceptions module. See
 * docs/OFFLINE_DESKTOP.md's "Online-only safety boundary" section.
 */
export function createPosAdapter(ctx: PosAdapterContext) {
  const base = { db: ctx.db, organizationId: ctx.organizationId, moduleKey: "pos" as const, actingUserName: ctx.actingUserName };

  return {
    recordSale: (entityId: string, payload: PosSalePayload) =>
      recordOfflineMutation({ ...base, entityType: POS_ENTITY_TYPES.SALE, entityId, operation: "CREATE", baseVersion: 0, payload }),

    createRegister: (entityId: string, payload: PosRegisterPayload) =>
      recordOfflineMutation({ ...base, entityType: POS_ENTITY_TYPES.REGISTER, entityId, operation: "CREATE", baseVersion: 0, payload }),

    updateRegister: (entityId: string, payload: PosRegisterPayload, baseVersion: number) =>
      recordOfflineMutation({ ...base, entityType: POS_ENTITY_TYPES.REGISTER, entityId, operation: "UPDATE", baseVersion, payload }),

    /** entityId is a client-generated correlation id, not the server's session id: the real registerId travels inside the payload. See pos.adapters.ts's comment on why session/refund actions are modeled as events. */
    openSession: (entityId: string, payload: PosSessionOpenPayload) =>
      recordOfflineMutation({ ...base, entityType: POS_ENTITY_TYPES.SESSION_OPEN, entityId, operation: "CREATE", baseVersion: 0, payload }),

    closeSession: (entityId: string, payload: PosSessionClosePayload) =>
      recordOfflineMutation({ ...base, entityType: POS_ENTITY_TYPES.SESSION_CLOSE, entityId, operation: "CREATE", baseVersion: 0, payload }),

    refundSale: (entityId: string, payload: PosSaleRefundPayload) =>
      recordOfflineMutation({ ...base, entityType: POS_ENTITY_TYPES.SALE_REFUND, entityId, operation: "CREATE", baseVersion: 0, payload }),

    updateReceiptFooter: (payload: PosReceiptFooterPayload, baseVersion: number) =>
      recordOfflineMutation({ ...base, entityType: POS_ENTITY_TYPES.SETTINGS_RECEIPT_FOOTER, entityId: POS_SETTINGS_ENTITY_ID, operation: "UPDATE", baseVersion, payload }),

    updateSalePrefix: (payload: PosSalePrefixPayload, baseVersion: number) =>
      recordOfflineMutation({ ...base, entityType: POS_ENTITY_TYPES.SETTINGS_SALE_PREFIX, entityId: POS_SETTINGS_ENTITY_ID, operation: "UPDATE", baseVersion, payload }),
  };
}

export type PosAdapter = ReturnType<typeof createPosAdapter>;
