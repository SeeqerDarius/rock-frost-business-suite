import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as pos from "@/modules/pos/service";
import * as inventory from "@/modules/inventory/service";
import { createTestOrg, cleanupTestOrg, type TestOrg } from "../setup/fixtures";

/**
 * Real-Postgres equivalent of the mocked IDOR coverage for
 * src/modules/pos/service.ts. POS registers reference Inventory's
 * InventoryWarehouse by id (documented cross-module dependency per
 * docs/MODULE_BOUNDARIES.md), so Org B's fixture warehouse is created
 * through Inventory's own createWarehouse() rather than a direct
 * testDb.inventoryWarehouse.create() call. validateWarehouseRef() and
 * openSession()'s registerId lookup both throw the module's own exported
 * pos.NotFoundError.
 */

let orgA: TestOrg;
let orgB: TestOrg;

let orgBWarehouse: Awaited<ReturnType<typeof inventory.createWarehouse>>;
let orgARegister: Awaited<ReturnType<typeof pos.createRegister>>;
let orgBRegister: Awaited<ReturnType<typeof pos.createRegister>>;

beforeAll(async () => {
  orgA = await createTestOrg("orgA-pos");
  orgB = await createTestOrg("orgB-pos");

  orgBWarehouse = await inventory.createWarehouse(orgB.organizationId, { name: "Org B Warehouse" });
  orgARegister = await pos.createRegister(orgA.organizationId, { name: "Org A Register" });
  orgBRegister = await pos.createRegister(orgB.organizationId, { name: "Org B Register", warehouseId: orgBWarehouse.id });
});

afterAll(async () => {
  await cleanupTestOrg(orgA);
  await cleanupTestOrg(orgB);
});

describe("POS service — cross-tenant isolation against real Postgres", () => {
  it("createRegister rejects a warehouseId from another organization", async () => {
    await expect(
      pos.createRegister(orgA.organizationId, { name: "Should Fail", warehouseId: orgBWarehouse.id }),
    ).rejects.toThrow(pos.NotFoundError);
  });

  it("updateRegister rejects a warehouseId from another organization", async () => {
    await expect(
      pos.updateRegister(orgA.organizationId, orgARegister.id, {
        name: orgARegister.name,
        warehouseId: orgBWarehouse.id,
      }),
    ).rejects.toThrow(pos.NotFoundError);
  });

  it("openSession rejects a registerId from another organization", async () => {
    await expect(
      pos.openSession(orgA.organizationId, { registerId: orgBRegister.id, openingFloat: "0" }),
    ).rejects.toThrow(pos.NotFoundError);
  });

  it("listRegisters scoped to Org A never returns Org B's register", async () => {
    const list = await pos.listRegisters(orgA.organizationId);
    expect(list.map((r) => r.id)).not.toContain(orgBRegister.id);
    expect(list.map((r) => r.id)).toContain(orgARegister.id);
  });
});
