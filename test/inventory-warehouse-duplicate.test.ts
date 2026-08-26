import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = {
  inventoryWarehouse: { create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
};

vi.mock("@/lib/db", () => ({ db: mockDb }));

const inventory = await import("@/modules/inventory/service");
const ORG = "org-1";

function uniqueConstraintError() {
  const error = new Error("Unique constraint failed on the fields: (organizationId, name)") as Error & { code: string };
  error.code = "P2002";
  return error;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("inventory warehouse duplicate names", () => {
  it("createWarehouse converts a P2002 unique-constraint violation into WarehouseNameTakenError", async () => {
    mockDb.inventoryWarehouse.create.mockRejectedValue(uniqueConstraintError());

    await expect(inventory.createWarehouse(ORG, { name: "Main" })).rejects.toThrow(inventory.WarehouseNameTakenError);
    expect(mockDb.inventoryWarehouse.updateMany).not.toHaveBeenCalled();
  });

  it("updateWarehouse converts a P2002 unique-constraint violation into WarehouseNameTakenError", async () => {
    mockDb.inventoryWarehouse.update.mockRejectedValue(uniqueConstraintError());

    await expect(inventory.updateWarehouse(ORG, "wh-1", { name: "Main" })).rejects.toThrow(inventory.WarehouseNameTakenError);
    expect(mockDb.inventoryWarehouse.updateMany).not.toHaveBeenCalled();
  });

  it("lets unrelated errors propagate unchanged", async () => {
    const dbError = new Error("connection reset");
    mockDb.inventoryWarehouse.create.mockRejectedValue(dbError);

    await expect(inventory.createWarehouse(ORG, { name: "Main" })).rejects.toThrow("connection reset");
  });
});
