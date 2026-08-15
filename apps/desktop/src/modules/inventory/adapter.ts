import type { LocalDatabase } from "@/db/local-database";
import { recordOfflineMutation } from "@/modules/offline-mutation-recorder";
import { INVENTORY_ENTITY_TYPES, type InventoryMovementPayload } from "@/modules/inventory/types";
export interface InventoryAdapterContext { db: LocalDatabase; organizationId: string; actingUserName: string | null }
export function createInventoryAdapter(ctx: InventoryAdapterContext) {
  return { recordMovement: (entityId: string, payload: InventoryMovementPayload) => recordOfflineMutation({ db: ctx.db, organizationId: ctx.organizationId, moduleKey: "inventory", entityType: INVENTORY_ENTITY_TYPES.MOVEMENT, entityId, operation: "CREATE", baseVersion: 0, payload, actingUserName: ctx.actingUserName }) };
}
export type InventoryAdapter = ReturnType<typeof createInventoryAdapter>;
