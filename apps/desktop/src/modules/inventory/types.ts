export interface InventoryMovementPayload extends Record<string, unknown> {
  itemId: string; warehouseId: string; type: "RECEIPT" | "ADJUSTMENT"; quantity: number;
  reference?: string | null; notes?: string | null; occurredAt: string;
}
export const INVENTORY_ENTITY_TYPES = { MOVEMENT: "inventory.movement" } as const;
