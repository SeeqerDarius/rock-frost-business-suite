import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = {
  fleetMaintenanceRequest: { findFirst: vi.fn(), update: vi.fn() },
  fleetMechanic: { findFirst: vi.fn() },
  fleetMaintenanceEvent: { create: vi.fn(), createMany: vi.fn() },
  fleetVehicle: { update: vi.fn() },
  fleetMaintenanceAttachment: { create: vi.fn() },
  fileAsset: { create: vi.fn() },
  notification: { create: vi.fn() },
  $transaction: vi.fn(),
};

vi.mock("@/lib/db", () => ({ db: mockDb }));

function txPassthrough() {
  mockDb.$transaction.mockImplementation(async (fn: (tx: typeof mockDb) => Promise<unknown>) => fn(mockDb));
}

const fleet = await import("@/modules/fleet/service");

const ORG = "org-1";

beforeEach(() => {
  vi.clearAllMocks();
  txPassthrough();
});

describe("recordMaintenanceEstimate", () => {
  it.each(["REPORTED", "AWAITING_OWNER_APPROVAL", "APPROVED", "ASSIGNED"])(
    "records an estimate while the request is %s",
    async (progressStatus) => {
      mockDb.fleetMaintenanceRequest.findFirst.mockResolvedValue({ id: "r", progressStatus });
      await fleet.recordMaintenanceEstimate(ORG, "r", "actor-1", "450.00", "Workshop quote");
      expect(mockDb.fleetMaintenanceRequest.update).toHaveBeenCalledWith({
        where: { id: "r" },
        data: { estimatedCost: "450.00", estimateNote: "Workshop quote" },
      });
      expect(mockDb.fleetMaintenanceEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ eventType: "ESTIMATE_RECORDED", note: "Workshop quote", metadata: { estimatedCost: "450.00" } }),
      });
    },
  );

  it.each(["IN_PROGRESS", "ON_HOLD", "COMPLETED", "VERIFIED", "REJECTED", "CANCELLED"])(
    "refuses to record an estimate once the repair has reached %s",
    async (progressStatus) => {
      mockDb.fleetMaintenanceRequest.findFirst.mockResolvedValue({ id: "r", progressStatus });
      await expect(fleet.recordMaintenanceEstimate(ORG, "r", "actor-1", "100.00")).rejects.toThrow(fleet.InvalidMaintenanceTransitionError);
      expect(mockDb.fleetMaintenanceRequest.update).not.toHaveBeenCalled();
    },
  );

  it("rejects a negative estimate", async () => {
    await expect(fleet.recordMaintenanceEstimate(ORG, "r", "actor-1", "-10.00")).rejects.toThrow(fleet.InvalidPaymentAmountError);
  });

  it("clears the estimate when passed null", async () => {
    mockDb.fleetMaintenanceRequest.findFirst.mockResolvedValue({ id: "r", progressStatus: "REPORTED" });
    await fleet.recordMaintenanceEstimate(ORG, "r", "actor-1", null);
    expect(mockDb.fleetMaintenanceRequest.update).toHaveBeenCalledWith({
      where: { id: "r" },
      data: { estimatedCost: undefined, estimateNote: undefined },
    });
  });
});

describe("scheduleExternalMaintenanceRepair", () => {
  it("schedules a repair for a mechanic with no self-service login", async () => {
    mockDb.fleetMaintenanceRequest.findFirst.mockResolvedValue({
      id: "r", progressStatus: "ASSIGNED", mechanic: { id: "mech-1", name: "Accra Auto Works", userId: null },
    });
    const scheduledRepairAt = new Date("2026-09-10T00:00:00.000Z");
    await fleet.scheduleExternalMaintenanceRepair(ORG, "r", "manager-1", scheduledRepairAt);
    expect(mockDb.fleetMaintenanceRequest.update).toHaveBeenCalledWith({ where: { id: "r" }, data: { scheduledRepairAt, progressStatus: "SCHEDULED" } });
    expect(mockDb.fleetMaintenanceEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ eventType: "REPAIR_SCHEDULED", fromStatus: "ASSIGNED", toStatus: "SCHEDULED" }),
    });
  });

  it("refuses to schedule for a mechanic who has a self-service portal login", async () => {
    mockDb.fleetMaintenanceRequest.findFirst.mockResolvedValue({
      id: "r", progressStatus: "ASSIGNED", mechanic: { id: "mech-2", name: "Kwesi Boateng", userId: "user-mech-2" },
    });
    await expect(
      fleet.scheduleExternalMaintenanceRepair(ORG, "r", "manager-1", new Date()),
    ).rejects.toThrow(fleet.FleetMechanicNotExternalError);
    expect(mockDb.fleetMaintenanceRequest.update).not.toHaveBeenCalled();
  });

  it("refuses when no mechanic is assigned at all", async () => {
    mockDb.fleetMaintenanceRequest.findFirst.mockResolvedValue({ id: "r", progressStatus: "ASSIGNED", mechanic: null });
    await expect(fleet.scheduleExternalMaintenanceRepair(ORG, "r", "manager-1", new Date())).rejects.toThrow(fleet.NotFoundError);
  });

  it("refuses when the request isn't in ASSIGNED", async () => {
    mockDb.fleetMaintenanceRequest.findFirst.mockResolvedValue({
      id: "r", progressStatus: "SCHEDULED", mechanic: { id: "mech-1", name: "Accra Auto Works", userId: null },
    });
    await expect(fleet.scheduleExternalMaintenanceRepair(ORG, "r", "manager-1", new Date())).rejects.toThrow(fleet.InvalidMaintenanceTransitionError);
  });

  it("rejects a request from another organization", async () => {
    mockDb.fleetMaintenanceRequest.findFirst.mockResolvedValue(null);
    await expect(fleet.scheduleExternalMaintenanceRepair(ORG, "r-foreign", "manager-1", new Date())).rejects.toThrow(fleet.NotFoundError);
  });
});

describe("completeMaintenanceRepair with completion evidence", () => {
  it("creates one FleetMaintenanceAttachment per completion photo and stores the invoice reference", async () => {
    mockDb.fleetMaintenanceRequest.findFirst.mockResolvedValue({ id: "r", progressStatus: "IN_PROGRESS" });
    mockDb.fileAsset.create.mockResolvedValueOnce({ id: "asset-1" }).mockResolvedValueOnce({ id: "asset-2" });

    await fleet.completeMaintenanceRepair(ORG, "r", "actor-1", "300.00", "Replaced brake pads", "INV-2026-045", [
      { fileName: "after-1.jpg", mimeType: "image/jpeg", size: 1000, dataUrl: "data:image/jpeg;base64,AAA", kind: "COMPLETION_EVIDENCE" },
      { fileName: "invoice.jpg", mimeType: "image/jpeg", size: 1000, dataUrl: "data:image/jpeg;base64,BBB", kind: "INVOICE" },
    ]);

    expect(mockDb.fleetMaintenanceRequest.update).toHaveBeenCalledWith({
      where: { id: "r" },
      data: { progressStatus: "COMPLETED", repairCost: "300.00", completedAt: expect.any(Date), invoiceReference: "INV-2026-045" },
    });
    expect(mockDb.fileAsset.create).toHaveBeenCalledTimes(2);
    expect(mockDb.fleetMaintenanceAttachment.create).toHaveBeenCalledWith({
      data: { organizationId: ORG, requestId: "r", fileAssetId: "asset-1", uploadedById: "actor-1", kind: "COMPLETION_EVIDENCE" },
    });
    expect(mockDb.fleetMaintenanceAttachment.create).toHaveBeenCalledWith({
      data: { organizationId: ORG, requestId: "r", fileAssetId: "asset-2", uploadedById: "actor-1", kind: "INVOICE" },
    });
  });

  it("completes with no attachments exactly as before (backward compatible)", async () => {
    mockDb.fleetMaintenanceRequest.findFirst.mockResolvedValue({ id: "r", progressStatus: "IN_PROGRESS" });
    await fleet.completeMaintenanceRepair(ORG, "r", "actor-1", "0.00", "Warranty work");
    expect(mockDb.fleetMaintenanceAttachment.create).not.toHaveBeenCalled();
    expect(mockDb.fleetMaintenanceRequest.update).toHaveBeenCalledWith({
      where: { id: "r" },
      data: { progressStatus: "COMPLETED", repairCost: "0.00", completedAt: expect.any(Date), invoiceReference: undefined },
    });
  });
});

describe("correctVerifiedMaintenanceExpense", () => {
  it("corrects the repair cost of a verified request and records the previous/new cost", async () => {
    const previousCost = { toFixed: () => "300.00" };
    mockDb.fleetMaintenanceRequest.findFirst.mockResolvedValue({
      id: "r", progressStatus: "VERIFIED", repairCost: previousCost, vehicle: { plateNumber: "GR-1" },
    });

    const { request, previousCost: returnedPrevious } = await fleet.correctVerifiedMaintenanceExpense(ORG, "r", "manager-1", "350.00", "Workshop revised the final invoice");

    expect(mockDb.fleetMaintenanceRequest.update).toHaveBeenCalledWith({ where: { id: "r" }, data: { repairCost: "350.00" } });
    expect(mockDb.fleetMaintenanceEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: "EXPENSE_CORRECTED",
        fromStatus: "VERIFIED",
        toStatus: "VERIFIED",
        note: "Workshop revised the final invoice",
        metadata: { previousCost: "300.00", newCost: "350.00" },
      }),
    });
    expect(request.repairCost.toString()).toBe("350");
    expect(returnedPrevious).toBe(previousCost);
  });

  it("refuses to correct a request that isn't VERIFIED", async () => {
    mockDb.fleetMaintenanceRequest.findFirst.mockResolvedValue({ id: "r", progressStatus: "COMPLETED", repairCost: null, vehicle: {} });
    await expect(fleet.correctVerifiedMaintenanceExpense(ORG, "r", "manager-1", "100.00", "reason")).rejects.toThrow(fleet.InvalidMaintenanceTransitionError);
    expect(mockDb.fleetMaintenanceRequest.update).not.toHaveBeenCalled();
  });

  it("rejects a negative corrected cost", async () => {
    await expect(fleet.correctVerifiedMaintenanceExpense(ORG, "r", "manager-1", "-5.00", "reason")).rejects.toThrow(fleet.InvalidPaymentAmountError);
  });

  it("records a null previous cost when the original repair had none (e.g. warranty work being corrected to a real cost)", async () => {
    mockDb.fleetMaintenanceRequest.findFirst.mockResolvedValue({ id: "r", progressStatus: "VERIFIED", repairCost: null, vehicle: { plateNumber: "GR-1" } });
    await fleet.correctVerifiedMaintenanceExpense(ORG, "r", "manager-1", "150.00", "Actually not warranty work");
    expect(mockDb.fleetMaintenanceEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ metadata: { previousCost: null, newCost: "150.00" } }),
    });
  });
});
