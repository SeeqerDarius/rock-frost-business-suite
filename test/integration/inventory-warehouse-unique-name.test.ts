import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as inventory from "@/modules/inventory/service";
import { createTestOrg, cleanupTestOrg, type TestOrg } from "./setup/fixtures";

/**
 * Real-Postgres proof that the (organizationId, name) unique constraint on
 * InventoryWarehouse is caught and converted to inventory.WarehouseNameTakenError
 * rather than propagating as a raw PrismaClientKnownRequestError (P2002), which
 * previously reached users as an unhandled 500 on the warehouse creation form.
 */

let orgA: TestOrg;
let orgB: TestOrg;

beforeAll(async () => {
  orgA = await createTestOrg("orgA-warehouse-unique");
  orgB = await createTestOrg("orgB-warehouse-unique");
});

afterAll(async () => {
  await cleanupTestOrg(orgA);
  await cleanupTestOrg(orgB);
});

describe("Inventory warehouse unique name constraint (real Postgres)", () => {
  it("rejects creating a second warehouse with the same name in the same organization", async () => {
    await inventory.createWarehouse(orgA.organizationId, { name: "Central Depot" });

    await expect(inventory.createWarehouse(orgA.organizationId, { name: "Central Depot" })).rejects.toThrow(
      inventory.WarehouseNameTakenError,
    );
  });

  it("rejects renaming a warehouse to a name already used by another warehouse in the same organization", async () => {
    await inventory.createWarehouse(orgA.organizationId, { name: "Taken Name" });
    const other = await inventory.createWarehouse(orgA.organizationId, { name: "Renamable Warehouse" });

    await expect(
      inventory.updateWarehouse(orgA.organizationId, other.id, { name: "Taken Name" }),
    ).rejects.toThrow(inventory.WarehouseNameTakenError);
  });

  it("allows the same warehouse name in different organizations", async () => {
    await inventory.createWarehouse(orgA.organizationId, { name: "Shared Name Warehouse" });

    await expect(
      inventory.createWarehouse(orgB.organizationId, { name: "Shared Name Warehouse" }),
    ).resolves.toMatchObject({ name: "Shared Name Warehouse" });
  });
});
