import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Regression tests for the snapshot decomposition (nested-blob-per-module
 * -> flat OfflineSnapshotRow[]). Covers row shape/scoping equivalence to
 * the original nested response for each of the 4 existing modules, plus
 * that buildOfflineSnapshot in service.ts composes the right builders for
 * the right authorizedModuleKeys.
 */

const mockDb = {
  fleetVehicle: { findMany: vi.fn() },
  fleetDriver: { findFirst: vi.fn() },
  fleetWorkAndPayContract: { findMany: vi.fn() },
  hirePurchaseAccount: { findMany: vi.fn() },
  inventoryItem: { findMany: vi.fn() },
  inventoryWarehouse: { findMany: vi.fn() },
  inventoryStock: { findMany: vi.fn() },
  posSession: { findMany: vi.fn() },
  offlineDevice: { update: vi.fn() },
};

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/modules/installment/access", () => ({
  resolveInstallmentAccessScope: vi.fn(async () => ({ kind: "organization" as const })),
}));

const { buildFleetSnapshot } = await import("@/lib/offline-sync/snapshot-builders/fleet");
const { buildInstallmentSnapshot } = await import("@/lib/offline-sync/snapshot-builders/installment");
const { buildInventorySnapshot } = await import("@/lib/offline-sync/snapshot-builders/inventory");
const { buildPosSnapshot } = await import("@/lib/offline-sync/snapshot-builders/pos");
const { buildOfflineSnapshot } = await import("@/lib/offline-sync/service");

function fakeContext(overrides: Record<string, unknown> = {}) {
  return {
    device: { id: "device-1", organizationId: "org-1", userId: "user-1", offlineAccessUntil: new Date("2026-08-20T00:00:00.000Z") },
    tenant: { permissions: [], enabledModuleKeys: [] },
    authorizedModuleKeys: [],
    ...overrides,
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fleet snapshot builder", () => {
  it("decomposes vehicles, the driver profile, and contracts into rows with id/updatedAt promoted out of payload", async () => {
    mockDb.fleetVehicle.findMany.mockResolvedValue([
      { id: "v1", assetTag: "AT-1", plateNumber: "GR-1", make: "Toyota", model: "Hiace", status: "ACTIVE", assignedDriverId: "d1", updatedAt: new Date("2026-08-01T00:00:00.000Z") },
    ]);
    mockDb.fleetDriver.findFirst.mockResolvedValue({ id: "d1", updatedAt: new Date("2026-08-02T00:00:00.000Z"), assignedVehicles: [{ id: "v1" }] });
    mockDb.fleetWorkAndPayContract.findMany.mockResolvedValue([
      { id: "c1", vehicleId: "v1", outstandingBalance: "100.00", weeklyPaymentAmount: "50.00", updatedAt: new Date("2026-08-03T00:00:00.000Z") },
    ]);

    const result = await buildFleetSnapshot(fakeContext());

    expect(result.truncated).toBe(false);
    expect(result.rows).toEqual([
      { entityType: "fleet.vehicle", entityId: "v1", version: Date.parse("2026-08-01T00:00:00.000Z"), payload: { assetTag: "AT-1", plateNumber: "GR-1", make: "Toyota", model: "Hiace", status: "ACTIVE", assignedDriverId: "d1" } },
      { entityType: "fleet.driver_profile", entityId: "d1", version: Date.parse("2026-08-02T00:00:00.000Z"), payload: { assignedVehicles: [{ id: "v1" }] } },
      { entityType: "fleet.work_and_pay_contract", entityId: "c1", version: Date.parse("2026-08-03T00:00:00.000Z"), payload: { vehicleId: "v1", outstandingBalance: "100.00", weeklyPaymentAmount: "50.00" } },
    ]);
  });

  it("omits the driver_profile row when the requesting user has no active driver record", async () => {
    mockDb.fleetVehicle.findMany.mockResolvedValue([]);
    mockDb.fleetDriver.findFirst.mockResolvedValue(null);
    mockDb.fleetWorkAndPayContract.findMany.mockResolvedValue([]);

    const result = await buildFleetSnapshot(fakeContext());
    expect(result.rows).toEqual([]);
  });

  it("flags truncated only from the vehicle collection exceeding the row cap, matching the original nested-blob behavior", async () => {
    const oversized = Array.from({ length: 501 }, (_, i) => ({
      id: `v${i}`, assetTag: "AT", plateNumber: "P", make: "M", model: "M", status: "ACTIVE", assignedDriverId: null, updatedAt: new Date(),
    }));
    mockDb.fleetVehicle.findMany.mockResolvedValue(oversized);
    mockDb.fleetDriver.findFirst.mockResolvedValue(null);
    mockDb.fleetWorkAndPayContract.findMany.mockResolvedValue([]);

    const result = await buildFleetSnapshot(fakeContext());
    expect(result.truncated).toBe(true);
    expect(result.rows.filter((row) => row.entityType === "fleet.vehicle")).toHaveLength(500);
  });
});

describe("installment snapshot builder", () => {
  it("decomposes accounts into rows", async () => {
    mockDb.hirePurchaseAccount.findMany.mockResolvedValue([
      { id: "a1", customerId: "cust1", productId: "p1", balance: "200.00", totalPaid: "300.00", status: "ACTIVE", updatedAt: new Date("2026-08-04T00:00:00.000Z"), customer: { customerCode: "C-1", fullName: "Ama", phone: "0000" } },
    ]);

    const result = await buildInstallmentSnapshot(fakeContext());
    expect(result.rows).toEqual([
      { entityType: "installment.account", entityId: "a1", version: Date.parse("2026-08-04T00:00:00.000Z"), payload: { customerId: "cust1", productId: "p1", balance: "200.00", totalPaid: "300.00", status: "ACTIVE", customer: { customerCode: "C-1", fullName: "Ama", phone: "0000" } } },
    ]);
  });
});

describe("inventory snapshot builder", () => {
  it("gives inventory-manage users cost prices and org-wide warehouse scope, with warehouse/session rows versioned 0 since those models have no updatedAt", async () => {
    mockDb.inventoryItem.findMany.mockResolvedValue([
      { id: "i1", sku: "SKU-1", name: "Widget", unit: "pcs", costPrice: "10.00", updatedAt: new Date("2026-08-05T00:00:00.000Z") },
    ]);
    mockDb.inventoryWarehouse.findMany.mockResolvedValue([{ id: "w1", name: "Main", location: "Accra", active: true }]);
    mockDb.inventoryStock.findMany.mockResolvedValue([{ id: "s1", itemId: "i1", warehouseId: "w1", quantity: 5, updatedAt: new Date("2026-08-06T00:00:00.000Z") }]);

    const result = await buildInventorySnapshot(fakeContext(), ["inventory"]);

    const itemRow = result.rows.find((row) => row.entityType === "inventory.item");
    expect(itemRow?.payload).toMatchObject({ costPrice: "10.00" });
    const warehouseRow = result.rows.find((row) => row.entityType === "inventory.warehouse");
    expect(warehouseRow).toMatchObject({ entityId: "w1", version: 0 });
    const stockRow = result.rows.find((row) => row.entityType === "inventory.stock");
    expect(stockRow).toMatchObject({ entityId: "s1", version: Date.parse("2026-08-06T00:00:00.000Z") });
  });

  it("omits cost prices and restricts warehouse scope to the user's own open POS-session warehouses for POS-only users", async () => {
    mockDb.posSession.findMany.mockResolvedValue([{ register: { warehouseId: "w1" } }]);
    mockDb.inventoryItem.findMany.mockResolvedValue([{ id: "i1", sku: "SKU-1", name: "Widget", unit: "pcs", updatedAt: new Date() }]);
    mockDb.inventoryWarehouse.findMany.mockResolvedValue([{ id: "w1", name: "Main", location: "Accra", active: true }]);
    mockDb.inventoryStock.findMany.mockResolvedValue([]);

    const result = await buildInventorySnapshot(fakeContext(), ["pos"]);

    const itemRow = result.rows.find((row) => row.entityType === "inventory.item");
    expect(itemRow?.payload).not.toHaveProperty("costPrice");
    expect(mockDb.inventoryWarehouse.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { in: ["w1"] } }) }),
    );
  });
});

describe("pos snapshot builder", () => {
  it("decomposes the user's own open sessions into rows versioned 0, never truncated", async () => {
    mockDb.posSession.findMany.mockResolvedValue([
      { id: "sess1", registerId: "r1", openedAt: new Date("2026-08-07T00:00:00.000Z"), openingFloat: "50.00", register: { name: "Front", warehouseId: "w1" } },
    ]);

    const result = await buildPosSnapshot(fakeContext());
    expect(result.truncated).toBe(false);
    expect(result.rows).toEqual([
      { entityType: "pos.session", entityId: "sess1", version: 0, payload: { registerId: "r1", openedAt: new Date("2026-08-07T00:00:00.000Z"), openingFloat: "50.00", register: { name: "Front", warehouseId: "w1" } } },
    ]);
  });
});

describe("buildOfflineSnapshot composition (service.ts)", () => {
  it("only builds sections for authorized modules and flattens their rows into one list", async () => {
    mockDb.fleetVehicle.findMany.mockResolvedValue([{ id: "v1", assetTag: "A", plateNumber: "P", make: "M", model: "M", status: "ACTIVE", assignedDriverId: null, updatedAt: new Date() }]);
    mockDb.fleetDriver.findFirst.mockResolvedValue(null);
    mockDb.fleetWorkAndPayContract.findMany.mockResolvedValue([]);

    const context = fakeContext({ authorizedModuleKeys: ["fleet"] });
    const response = await buildOfflineSnapshot(context);

    expect(mockDb.hirePurchaseAccount.findMany).not.toHaveBeenCalled();
    expect(mockDb.inventoryItem.findMany).not.toHaveBeenCalled();
    expect(response.rows).toHaveLength(1);
    expect(response.rows[0]).toMatchObject({ entityType: "fleet.vehicle", entityId: "v1" });
    expect(response.fullSnapshot).toBe(true);
    expect(mockDb.offlineDevice.update).toHaveBeenCalledWith({ where: { id: "device-1" }, data: { lastSyncAt: expect.any(Date) } });
  });

  it("builds the shared inventory section once when both inventory and pos are authorized", async () => {
    mockDb.inventoryItem.findMany.mockResolvedValue([]);
    mockDb.inventoryWarehouse.findMany.mockResolvedValue([]);
    mockDb.inventoryStock.findMany.mockResolvedValue([]);
    mockDb.posSession.findMany.mockResolvedValue([]);

    const context = fakeContext({ authorizedModuleKeys: ["inventory", "pos"] });
    await buildOfflineSnapshot(context);

    expect(mockDb.inventoryItem.findMany).toHaveBeenCalledTimes(1);
  });

  it("aggregates truncated as true if any builder reports truncation", async () => {
    const oversizedAccounts = Array.from({ length: 501 }, (_, i) => ({
      id: `a${i}`, customerId: "c", productId: "p", balance: "0", totalPaid: "0", status: "ACTIVE", updatedAt: new Date(), customer: { customerCode: "C", fullName: "N", phone: "0" },
    }));
    mockDb.hirePurchaseAccount.findMany.mockResolvedValue(oversizedAccounts);

    const context = fakeContext({ authorizedModuleKeys: ["installment"] });
    const response = await buildOfflineSnapshot(context);
    expect(response.truncated).toBe(true);
  });
});
