import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as inventory from "@/modules/inventory/service";
import { testDb } from "../setup/db";
import { createTestOrg, cleanupTestOrg, type TestOrg } from "../setup/fixtures";

/**
 * Real-Postgres equivalent of the inventory block in
 * test/pass2-financial-inventory-integrity.test.ts — proves recordMovement's
 * item/warehouse ownership checks against a real Prisma/Postgres stack, not
 * a mocked db. Two fully isolated organizations; every cross-organization
 * reference from Org A into a real Org B row must be rejected with
 * inventory.NotFoundError, and Org A's list* reads must never surface
 * Org B's rows.
 *
 * createItem/updateItem's ItemInput.categoryId was found unvalidated for
 * organization ownership while writing this suite — fixed in the same
 * Pass 4 commit (new requireCategory() helper reusing the module's
 * existing NotFoundError), covered below.
 */

let orgA: TestOrg;
let orgB: TestOrg;

let orgBWarehouseId: string;
let orgBItemId: string;

let orgAWarehouseId: string;
let orgAItemId: string;

beforeAll(async () => {
  orgA = await createTestOrg("orgA-inventory");
  orgB = await createTestOrg("orgB-inventory");

  const orgBWarehouse = await inventory.createWarehouse(orgB.organizationId, { name: "Org B Warehouse" });
  orgBWarehouseId = orgBWarehouse.id;

  const orgBItem = await inventory.createItem(orgB.organizationId, {
    sku: `ORGB-SKU-${Date.now()}`,
    name: "Org B Item",
    costPrice: "10.00",
  });
  orgBItemId = orgBItem.id;

  const orgAWarehouse = await inventory.createWarehouse(orgA.organizationId, { name: "Org A Warehouse" });
  orgAWarehouseId = orgAWarehouse.id;

  const orgAItem = await inventory.createItem(orgA.organizationId, {
    sku: `ORGA-SKU-${Date.now()}`,
    name: "Org A Item",
    costPrice: "10.00",
  });
  orgAItemId = orgAItem.id;
});

afterAll(async () => {
  await cleanupTestOrg(orgA);
  await cleanupTestOrg(orgB);
});

describe("Inventory tenant isolation (real Postgres)", () => {
  it("recordMovement rejects an itemId belonging to another organization", async () => {
    await expect(
      inventory.recordMovement(orgA.organizationId, {
        itemId: orgBItemId,
        warehouseId: orgAWarehouseId,
        type: "RECEIPT",
        quantity: 5,
      }),
    ).rejects.toThrow(inventory.NotFoundError);
  });

  it("recordMovement rejects a warehouseId belonging to another organization", async () => {
    await expect(
      inventory.recordMovement(orgA.organizationId, {
        itemId: orgAItemId,
        warehouseId: orgBWarehouseId,
        type: "RECEIPT",
        quantity: 5,
      }),
    ).rejects.toThrow(inventory.NotFoundError);
  });

  it("recordMovement TRANSFER rejects a toWarehouseId belonging to another organization", async () => {
    await expect(
      inventory.recordMovement(orgA.organizationId, {
        itemId: orgAItemId,
        warehouseId: orgAWarehouseId,
        type: "TRANSFER",
        quantity: 5,
        toWarehouseId: orgBWarehouseId,
      }),
    ).rejects.toThrow(inventory.NotFoundError);
  });

  it("recordMovement succeeds for a RECEIPT fully scoped to Org A (sanity check the ids above are otherwise valid)", async () => {
    const movement = await inventory.recordMovement(orgA.organizationId, {
      itemId: orgAItemId,
      warehouseId: orgAWarehouseId,
      type: "RECEIPT",
      quantity: 5,
    });
    expect(movement.organizationId).toBe(orgA.organizationId);
  });

  it("createItem rejects a categoryId belonging to another organization", async () => {
    const orgBCategory = await inventory.createCategory(orgB.organizationId, "Org B Category");
    await expect(
      inventory.createItem(orgA.organizationId, {
        sku: `ORGA-SKU-CAT-${Date.now()}`,
        name: "Org A Item With Foreign Category",
        costPrice: "10.00",
        categoryId: orgBCategory.id,
      }),
    ).rejects.toThrow(inventory.NotFoundError);
  });

  it("updateItem rejects a categoryId belonging to another organization", async () => {
    const orgBCategory = await inventory.createCategory(orgB.organizationId, "Org B Category 2");
    await expect(
      inventory.updateItem(orgA.organizationId, orgAItemId, {
        sku: `ORGA-SKU-${Date.now()}`,
        name: "Org A Item",
        costPrice: "10.00",
        categoryId: orgBCategory.id,
      }),
    ).rejects.toThrow(inventory.NotFoundError);
  });

  it("listWarehouses never returns another organization's warehouse", async () => {
    const warehouses = await inventory.listWarehouses(orgA.organizationId);
    expect(warehouses.some((w) => w.id === orgBWarehouseId)).toBe(false);
    expect(warehouses.some((w) => w.id === orgAWarehouseId)).toBe(true);
  });

  it("listItems never returns another organization's item", async () => {
    const items = await inventory.listItems(orgA.organizationId);
    expect(items.some((i) => i.id === orgBItemId)).toBe(false);
    expect(items.some((i) => i.id === orgAItemId)).toBe(true);
  });

  it("sanity: Org B's item really exists in the real database, scoped to Org B", async () => {
    const row = await testDb.inventoryItem.findUnique({ where: { id: orgBItemId } });
    expect(row?.organizationId).toBe(orgB.organizationId);
  });
});
