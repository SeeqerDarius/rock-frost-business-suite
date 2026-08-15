import type { LocalDatabase } from "@/db/local-database";
import { recordOfflineMutation } from "@/modules/offline-mutation-recorder";
import { INVENTORY_ENTITY_TYPES, type InventoryStockCountPayload, type InventoryStockMovementPayload } from "@/modules/inventory/types";

export interface InventoryAdapterContext {
  db: LocalDatabase;
  organizationId: string;
  actingUserName: string | null;
}

export function createInventoryAdapter(ctx: InventoryAdapterContext) {
  return {
    async recordStockCount(entityId: string, payload: InventoryStockCountPayload): Promise<void> {
      await recordOfflineMutation({
        db: ctx.db,
        organizationId: ctx.organizationId,
        moduleKey: "inventory",
        entityType: INVENTORY_ENTITY_TYPES.STOCK_COUNT,
        entityId,
        operation: "create",
        baseVersion: null,
        payload,
        actingUserName: ctx.actingUserName,
      });
    },

    /** See types.ts's doc comment on InventoryStockMovementPayload — never last-write-wins. */
    async recordStockMovement(entityId: string, payload: InventoryStockMovementPayload): Promise<void> {
      await recordOfflineMutation({
        db: ctx.db,
        organizationId: ctx.organizationId,
        moduleKey: "inventory",
        entityType: INVENTORY_ENTITY_TYPES.STOCK_MOVEMENT,
        entityId,
        operation: "create",
        baseVersion: null,
        payload,
        actingUserName: ctx.actingUserName,
      });
    },
  };
}

export type InventoryAdapter = ReturnType<typeof createInventoryAdapter>;
