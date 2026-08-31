import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = {
  fleetOwner: { findFirst: vi.fn() },
  fleetVehicle: { findFirst: vi.fn() },
  fleetVehicleExpense: { create: vi.fn() },
  fleetOwnerAgreement: { updateMany: vi.fn(), create: vi.fn() },
  fileAsset: { create: vi.fn() },
  $transaction: vi.fn(),
};

vi.mock("@/lib/db", () => ({ db: mockDb }));

const mocks = vi.hoisted(() => ({ postModuleExpense: vi.fn() }));
vi.mock("@/lib/accounting-integration", async () => {
  const actual = await vi.importActual<typeof import("@/lib/accounting-integration")>("@/lib/accounting-integration");
  return { ...actual, postModuleExpense: mocks.postModuleExpense };
});

const service = await import("@/modules/fleet/service");
const accounting = await import("@/modules/fleet/accounting");

const ORG = "org-1";

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.$transaction.mockImplementation(async (callback) => callback(mockDb));
  mocks.postModuleExpense.mockResolvedValue({ posted: true, journalEntryId: "journal-1" });
});

describe("computeFleetOwnerSettlement", () => {
  const GR_1 = { id: "vehicle-1", plateNumber: "GR-1234-20", verifiedCollections: 5000, verifiedExpenses: 800 };
  const GR_2 = { id: "vehicle-2", plateNumber: "GR-5678-21", verifiedCollections: 3000, verifiedExpenses: 200 };

  it("reports not configured when the owner has no agreement at all", () => {
    const result = service.computeFleetOwnerSettlement([GR_1], []);
    expect(result).toEqual({ settlementConfigured: false });
  });

  it("computes a worked Ghana example: 70% revenue share, GHS 200 flat management fee, minus verified expenses", () => {
    const agreement = { vehicleId: null, revenueSharePercent: "70" as unknown as number, managementFeeFlat: "200" as unknown as number, managementFeePercent: null, createdAt: new Date("2026-08-01") };
    const result = service.computeFleetOwnerSettlement([GR_1], [agreement as never]);
    expect(result.settlementConfigured).toBe(true);
    if (!result.settlementConfigured) throw new Error("unreachable");
    // ownerRevenueShare = 5000 * 0.70 = 3500; managementFee = 200 flat; netSettlement = 3500 - 200 - 800 = 2500
    expect(result.vehicles[0]).toMatchObject({ ownerRevenueShare: 3500, managementFee: 200, verifiedExpenses: 800, netSettlement: 2500 });
    expect(result.totals.netSettlement).toBe(2500);
    expect(result.coveredVehicleCount).toBe(1);
    expect(result.uncoveredVehicleCount).toBe(0);
  });

  it("gives the owner 100% of collections when no revenueSharePercent is set", () => {
    const agreement = { vehicleId: null, revenueSharePercent: null, managementFeeFlat: null, managementFeePercent: null, createdAt: new Date("2026-08-01") };
    const result = service.computeFleetOwnerSettlement([GR_1], [agreement as never]);
    if (!result.settlementConfigured) throw new Error("unreachable");
    expect(result.vehicles[0].ownerRevenueShare).toBe(5000);
    expect(result.vehicles[0].netSettlement).toBe(5000 - 800);
  });

  it("a per-vehicle agreement overrides the portfolio-wide agreement for that vehicle only", () => {
    const portfolio = { vehicleId: null, revenueSharePercent: "70" as unknown as number, managementFeeFlat: null, managementFeePercent: null, createdAt: new Date("2026-07-01") };
    const override = { vehicleId: "vehicle-1", revenueSharePercent: "90" as unknown as number, managementFeeFlat: null, managementFeePercent: null, createdAt: new Date("2026-08-01") };
    const result = service.computeFleetOwnerSettlement([GR_1, GR_2], [portfolio as never, override as never]);
    if (!result.settlementConfigured) throw new Error("unreachable");
    const vehicle1 = result.vehicles.find((line) => line.vehicleId === "vehicle-1")!;
    const vehicle2 = result.vehicles.find((line) => line.vehicleId === "vehicle-2")!;
    expect(vehicle1.revenueSharePercent).toBe(90);
    expect(vehicle2.revenueSharePercent).toBe(70);
    expect(result.coveredVehicleCount).toBe(2);
  });

  it("excludes a vehicle with no applicable agreement from totals but counts it as uncovered", () => {
    const override = { vehicleId: "vehicle-1", revenueSharePercent: "80" as unknown as number, managementFeeFlat: null, managementFeePercent: null, createdAt: new Date("2026-08-01") };
    const result = service.computeFleetOwnerSettlement([GR_1, GR_2], [override as never]);
    if (!result.settlementConfigured) throw new Error("unreachable");
    expect(result.coveredVehicleCount).toBe(1);
    expect(result.uncoveredVehicleCount).toBe(1);
    expect(result.vehicles.some((line) => line.vehicleId === "vehicle-2")).toBe(false);
    expect(result.totals.verifiedCollections).toBe(GR_1.verifiedCollections);
  });
});

describe("createFleetOwnerAgreement", () => {
  it("rejects an unknown owner before touching the transaction", async () => {
    mockDb.fleetOwner.findFirst.mockResolvedValue(null);
    await expect(
      service.createFleetOwnerAgreement(ORG, { ownerId: "owner-foreign", revenueSharePercent: "70" }),
    ).rejects.toThrow(service.NotFoundError);
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a vehicleId that isn't owned by this owner", async () => {
    mockDb.fleetOwner.findFirst.mockResolvedValue({ id: "owner-1" });
    mockDb.fleetVehicle.findFirst.mockResolvedValue(null);
    await expect(
      service.createFleetOwnerAgreement(ORG, { ownerId: "owner-1", vehicleId: "vehicle-foreign", revenueSharePercent: "70" }),
    ).rejects.toThrow(service.NotFoundError);
  });

  it("closes any currently-open agreement in the same scope, then creates the new one", async () => {
    mockDb.fleetOwner.findFirst.mockResolvedValue({ id: "owner-1" });
    mockDb.fleetOwnerAgreement.create.mockResolvedValue({ id: "agreement-2" });
    const effectiveFrom = new Date("2026-08-31T00:00:00.000Z");

    await service.createFleetOwnerAgreement(ORG, { ownerId: "owner-1", revenueSharePercent: "75", effectiveFrom });

    expect(mockDb.fleetOwnerAgreement.updateMany).toHaveBeenCalledWith({
      where: { organizationId: ORG, ownerId: "owner-1", vehicleId: null, effectiveTo: null },
      data: { effectiveTo: effectiveFrom },
    });
    expect(mockDb.fleetOwnerAgreement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ organizationId: ORG, ownerId: "owner-1", vehicleId: null, revenueSharePercent: "75", effectiveFrom }),
    });
  });
});

describe("createFleetVehicleExpense", () => {
  it("rejects a vehicleId from another organization", async () => {
    mockDb.fleetVehicle.findFirst.mockResolvedValue(null);
    await expect(
      service.createFleetVehicleExpense(ORG, { vehicleId: "vehicle-foreign", type: "FUEL", amount: "150.00", date: new Date() }),
    ).rejects.toThrow(service.NotFoundError);
    expect(mockDb.fleetVehicleExpense.create).not.toHaveBeenCalled();
  });

  it("rejects a zero or negative amount before touching the transaction", async () => {
    mockDb.fleetVehicle.findFirst.mockResolvedValue({ id: "vehicle-1" });
    await expect(
      service.createFleetVehicleExpense(ORG, { vehicleId: "vehicle-1", type: "FUEL", amount: "0.00", date: new Date() }),
    ).rejects.toThrow(service.InvalidPaymentAmountError);
    await expect(
      service.createFleetVehicleExpense(ORG, { vehicleId: "vehicle-1", type: "FUEL", amount: "-10.00", date: new Date() }),
    ).rejects.toThrow(service.InvalidPaymentAmountError);
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it("creates the expense with no attachment when no receipt is given", async () => {
    mockDb.fleetVehicle.findFirst.mockResolvedValue({ id: "vehicle-1" });
    mockDb.fleetVehicleExpense.create.mockResolvedValue({ id: "expense-1" });

    await service.createFleetVehicleExpense(ORG, { vehicleId: "vehicle-1", type: "FINE", amount: "120.50", date: new Date("2026-08-20") });

    expect(mockDb.fileAsset.create).not.toHaveBeenCalled();
    expect(mockDb.fleetVehicleExpense.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ organizationId: ORG, vehicleId: "vehicle-1", type: "FINE", amount: "120.50", receiptFileAssetId: null }),
    });
  });

  it("creates the receipt FileAsset first and links it when a receipt is given", async () => {
    mockDb.fleetVehicle.findFirst.mockResolvedValue({ id: "vehicle-1" });
    mockDb.fileAsset.create.mockResolvedValue({ id: "asset-1" });
    mockDb.fleetVehicleExpense.create.mockResolvedValue({ id: "expense-1" });

    await service.createFleetVehicleExpense(ORG, {
      vehicleId: "vehicle-1",
      type: "INSURANCE_PREMIUM",
      amount: "900.00",
      date: new Date("2026-08-20"),
      receipt: { fileName: "receipt.jpg", mimeType: "image/jpeg", size: 1024, dataUrl: "data:image/jpeg;base64,AAA=" },
    });

    expect(mockDb.fileAsset.create).toHaveBeenCalled();
    expect(mockDb.fleetVehicleExpense.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ receiptFileAssetId: "asset-1" }),
    });
  });
});

describe("postFleetVehicleExpense routes each expense type to its own GL account", () => {
  const CASES: Array<[string, string]> = [
    ["FUEL", "fleet-fuel"],
    ["FINE", "fleet-fine"],
    ["INSURANCE_PREMIUM", "fleet-insurance"],
    ["LICENSING", "fleet-licensing"],
    ["OTHER", "fleet-other"],
  ];

  it.each(CASES)("%s posts under sourceModule %s", async (type, sourceModule) => {
    await accounting.postFleetVehicleExpense(
      ORG,
      { id: "expense-1", type: type as never, amount: "100.00", date: new Date("2026-08-20") },
      "Fuel recorded",
      "user-1",
    );
    expect(mocks.postModuleExpense).toHaveBeenCalledWith(ORG, expect.objectContaining({
      sourceModule,
      sourceType: "FLEET_VEHICLE_EXPENSE",
      sourceId: "expense-1",
      postingPurpose: "RECORDED",
      amount: "100.00",
    }));
  });
});
