import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as inventory from "@/modules/inventory/service";
import { testDb } from "../setup/db";
import { createTestOrg, cleanupTestOrg, type TestOrg } from "../setup/fixtures";

/**
 * Real-Postgres concurrency proof for Inventory's recordMovement(): fires
 * genuinely simultaneous requests (real Promise.all, not sequential awaits)
 * against the same item/warehouse stock row and verifies the final
 * committed state — not just that each call individually validates
 * correctly (Milestone A already covers that), but that the *atomic guarded
 * decrement* (decrementGuarded()'s `updateMany` with `quantity: { gte: n }`
 * in its WHERE clause) actually prevents overselling when two transactions
 * race for the same row, and that concurrent increments never lose an
 * update.
 */

let org: TestOrg;

beforeAll(async () => {
  org = await createTestOrg("inventory-concurrency");
});

afterAll(async () => {
  await cleanupTestOrg(org);
});

async function stockQuantity(itemId: string, warehouseId: string) {
  const row = await testDb.inventoryStock.findUnique({
    where: { itemId_warehouseId: { itemId, warehouseId } },
  });
  return row?.quantity ?? 0;
}

describe("Inventory concurrency (real Postgres)", () => {
  it("two concurrent ISSUEs that combined exceed on-hand stock: exactly one succeeds, final quantity is exact", async () => {
    const warehouse = await inventory.createWarehouse(org.organizationId, { name: "Issue Race Warehouse" });
    const item = await inventory.createItem(org.organizationId, {
      sku: `ISSUE-RACE-${Date.now()}`,
      name: "Issue Race Item",
      costPrice: "10.00",
    });

    // Seed 10 units on hand.
    await inventory.recordMovement(org.organizationId, {
      itemId: item.id,
      warehouseId: warehouse.id,
      type: "RECEIPT",
      quantity: 10,
    });

    // Two concurrent ISSUEs of 6 each — combined 12 > 10 on hand.
    const results = await Promise.allSettled([
      inventory.recordMovement(org.organizationId, {
        itemId: item.id,
        warehouseId: warehouse.id,
        type: "ISSUE",
        quantity: 6,
      }),
      inventory.recordMovement(org.organizationId, {
        itemId: item.id,
        warehouseId: warehouse.id,
        type: "ISSUE",
        quantity: 6,
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(inventory.InsufficientStockError);

    // Exactly one ISSUE of 6 went through: 10 - 6 = 4. Never negative, never
    // double-decremented (which would have left -2).
    const finalQuantity = await stockQuantity(item.id, warehouse.id);
    expect(finalQuantity).toBe(4);
  });

  it("two concurrent RECEIPTs to the same item/warehouse: final quantity is the exact sum, both movements recorded", async () => {
    const warehouse = await inventory.createWarehouse(org.organizationId, { name: "Receipt Race Warehouse" });
    const item = await inventory.createItem(org.organizationId, {
      sku: `RECEIPT-RACE-${Date.now()}`,
      name: "Receipt Race Item",
      costPrice: "10.00",
    });

    const results = await Promise.allSettled([
      inventory.recordMovement(org.organizationId, {
        itemId: item.id,
        warehouseId: warehouse.id,
        type: "RECEIPT",
        quantity: 5,
      }),
      inventory.recordMovement(org.organizationId, {
        itemId: item.id,
        warehouseId: warehouse.id,
        type: "RECEIPT",
        quantity: 7,
      }),
    ]);

    expect(results.every((r) => r.status === "fulfilled")).toBe(true);

    const finalQuantity = await stockQuantity(item.id, warehouse.id);
    expect(finalQuantity).toBe(12);

    const movementCount = await testDb.inventoryMovement.count({
      where: { itemId: item.id, warehouseId: warehouse.id, organizationId: org.organizationId },
    });
    expect(movementCount).toBe(2);
  });

  it("two concurrent TRANSFERs from the same source where only one has enough stock: exactly one succeeds", async () => {
    const sourceWarehouse = await inventory.createWarehouse(org.organizationId, { name: "Transfer Source Warehouse" });
    const destWarehouse = await inventory.createWarehouse(org.organizationId, { name: "Transfer Dest Warehouse" });
    const item = await inventory.createItem(org.organizationId, {
      sku: `TRANSFER-RACE-${Date.now()}`,
      name: "Transfer Race Item",
      costPrice: "10.00",
    });

    // Seed 10 units at the source.
    await inventory.recordMovement(org.organizationId, {
      itemId: item.id,
      warehouseId: sourceWarehouse.id,
      type: "RECEIPT",
      quantity: 10,
    });

    // Two concurrent TRANSFERs of 6 each — combined 12 > 10 at the source.
    const results = await Promise.allSettled([
      inventory.recordMovement(org.organizationId, {
        itemId: item.id,
        warehouseId: sourceWarehouse.id,
        type: "TRANSFER",
        quantity: 6,
        toWarehouseId: destWarehouse.id,
      }),
      inventory.recordMovement(org.organizationId, {
        itemId: item.id,
        warehouseId: sourceWarehouse.id,
        type: "TRANSFER",
        quantity: 6,
        toWarehouseId: destWarehouse.id,
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(inventory.InsufficientStockError);

    // Source: only one transfer of 6 actually decremented: 10 - 6 = 4.
    const sourceQuantity = await stockQuantity(item.id, sourceWarehouse.id);
    expect(sourceQuantity).toBe(4);

    // Destination: only the one successful transfer's stock arrived.
    const destQuantity = await stockQuantity(item.id, destWarehouse.id);
    expect(destQuantity).toBe(6);
  });
});
