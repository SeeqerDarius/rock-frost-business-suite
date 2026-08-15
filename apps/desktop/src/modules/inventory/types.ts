/** See fleet/types.ts's file-level note — draft shapes, not a confirmed server schema. */

export interface InventoryStockCountPayload {
  warehouseId: string;
  itemId: string;
  countedAt: string;
  countedQuantity: number;
  countedByName: string;
  notes: string | null;
}

/** Never resolved with an implicit last-write-wins — a stock movement conflict must go through the server's declared conflict policy, same as a financial record. See conflict/conflict-policy.ts. */
export interface InventoryStockMovementPayload {
  warehouseId: string;
  itemId: string;
  type: "receipt" | "issue" | "adjustment" | "transfer";
  quantity: number;
  toWarehouseId: string | null;
  reference: string | null;
  occurredAt: string;
}

export const INVENTORY_ENTITY_TYPES = {
  STOCK_COUNT: "inventory.stock_count",
  STOCK_MOVEMENT: "inventory.stock_movement",
} as const;
