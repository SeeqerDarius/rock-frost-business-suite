import type { LocalDatabase } from "@/db/local-database";
import { recordOfflineMutation } from "@/modules/offline-mutation-recorder";
import { POS_ENTITY_TYPES, type PosSalePayload } from "@/modules/pos/types";
export interface PosAdapterContext { db: LocalDatabase; organizationId: string; actingUserName: string | null }
export function createPosAdapter(ctx: PosAdapterContext) {
  return { recordSale: (entityId: string, payload: PosSalePayload) => recordOfflineMutation({ db: ctx.db, organizationId: ctx.organizationId, moduleKey: "pos", entityType: POS_ENTITY_TYPES.SALE, entityId, operation: "CREATE", baseVersion: 0, payload, actingUserName: ctx.actingUserName }) };
}
export type PosAdapter = ReturnType<typeof createPosAdapter>;
