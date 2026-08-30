import fs from "node:fs";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = {
  fleetMaintenanceRequest: { findFirst: vi.fn(), update: vi.fn() },
  fleetMechanic: { findFirst: vi.fn() },
  fleetMaintenanceEvent: { create: vi.fn(), createMany: vi.fn() },
  fleetVehicle: { update: vi.fn() },
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

describe("managerReviewMaintenanceRequest", () => {
  const reportedRequest = { id: "req-1", progressStatus: "REPORTED", requestedById: null, vehicleId: "veh-1", vehicle: { plateNumber: "GR-1" } };

  it("approves straight to APPROVED when no owner approval is required", async () => {
    mockDb.fleetMaintenanceRequest.findFirst.mockResolvedValue(reportedRequest);
    await fleet.managerReviewMaintenanceRequest(ORG, "req-1", "actor-1", { approved: true, ownerApprovalRequired: false });
    expect(mockDb.fleetMaintenanceRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ progressStatus: "APPROVED" }) }),
    );
  });

  it("routes to AWAITING_OWNER_APPROVAL (the renamed REVIEWING) when owner approval is required", async () => {
    mockDb.fleetMaintenanceRequest.findFirst.mockResolvedValue(reportedRequest);
    await fleet.managerReviewMaintenanceRequest(ORG, "req-1", "actor-1", { approved: true, ownerApprovalRequired: true });
    expect(mockDb.fleetMaintenanceRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ progressStatus: "AWAITING_OWNER_APPROVAL", ownerApprovalStatus: "PENDING" }) }),
    );
  });

  it("declines to REJECTED, not the old CANCELLED", async () => {
    mockDb.fleetMaintenanceRequest.findFirst.mockResolvedValue(reportedRequest);
    await fleet.managerReviewMaintenanceRequest(ORG, "req-1", "actor-1", { approved: false, ownerApprovalRequired: false });
    expect(mockDb.fleetMaintenanceRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ progressStatus: "REJECTED", approvalStatus: "REJECTED" }) }),
    );
  });
});

describe("ownerDecisionMaintenanceRequest", () => {
  const awaitingRequest = {
    id: "req-1",
    progressStatus: "AWAITING_OWNER_APPROVAL",
    ownerApprovalRequired: true,
    approvalStatus: "APPROVED",
    ownerApprovalStatus: "PENDING",
    vehicle: { owner: { userId: "owner-user-1" } },
  };

  it("approval only ever reaches APPROVED - never IN_PROGRESS or COMPLETED (regression lock)", async () => {
    mockDb.fleetMaintenanceRequest.findFirst.mockResolvedValue(awaitingRequest);
    await fleet.ownerDecisionMaintenanceRequest(ORG, "req-1", "owner-user-1", true);
    const call = mockDb.fleetMaintenanceRequest.update.mock.calls[0][0];
    expect(call.data.progressStatus).toBe("APPROVED");
    expect(call.data.progressStatus).not.toBe("IN_PROGRESS");
    expect(call.data.progressStatus).not.toBe("COMPLETED");
  });

  it("decline becomes REJECTED, not the old CANCELLED", async () => {
    mockDb.fleetMaintenanceRequest.findFirst.mockResolvedValue(awaitingRequest);
    await fleet.ownerDecisionMaintenanceRequest(ORG, "req-1", "owner-user-1", false);
    expect(mockDb.fleetMaintenanceRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ progressStatus: "REJECTED", ownerApprovalStatus: "REJECTED" }) }),
    );
  });

  it("refuses a decision from anyone but the vehicle's own linked owner", async () => {
    mockDb.fleetMaintenanceRequest.findFirst.mockResolvedValue(awaitingRequest);
    await expect(fleet.ownerDecisionMaintenanceRequest(ORG, "req-1", "someone-else", true)).rejects.toThrow(fleet.NotFoundError);
    expect(mockDb.fleetMaintenanceRequest.update).not.toHaveBeenCalled();
  });
});

describe("Full maintenance lifecycle (mocked)", () => {
  it("walks REPORTED -> AWAITING_OWNER_APPROVAL -> APPROVED -> ASSIGNED -> SCHEDULED -> IN_PROGRESS -> ON_HOLD -> IN_PROGRESS -> COMPLETED -> VERIFIED in one continuous pass (D6 end-to-end regression)", async () => {
    // managerReviewMaintenanceRequest: REPORTED -> AWAITING_OWNER_APPROVAL (owner sign-off required)
    mockDb.fleetMaintenanceRequest.findFirst.mockResolvedValue({
      id: "r", progressStatus: "REPORTED", requestedById: null, vehicleId: "veh-1", vehicle: { plateNumber: "GR-1" },
    });
    await fleet.managerReviewMaintenanceRequest(ORG, "r", "actor", { approved: true, ownerApprovalRequired: true });
    expect(mockDb.fleetMaintenanceRequest.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { id: "r" }, data: expect.objectContaining({ progressStatus: "AWAITING_OWNER_APPROVAL", ownerApprovalStatus: "PENDING" }) }),
    );

    // ownerDecisionMaintenanceRequest: AWAITING_OWNER_APPROVAL -> APPROVED (owner sign-off, never advances further)
    mockDb.fleetMaintenanceRequest.findFirst.mockResolvedValue({
      id: "r", progressStatus: "AWAITING_OWNER_APPROVAL", ownerApprovalRequired: true, approvalStatus: "APPROVED", ownerApprovalStatus: "PENDING",
      vehicle: { owner: { userId: "owner-user" } },
    });
    await fleet.ownerDecisionMaintenanceRequest(ORG, "r", "owner-user", true, null);
    const ownerCall = mockDb.fleetMaintenanceRequest.update.mock.calls.at(-1)![0];
    expect(ownerCall.data.progressStatus).toBe("APPROVED");

    // assignMaintenanceMechanic: APPROVED -> ASSIGNED
    mockDb.fleetMaintenanceRequest.findFirst.mockResolvedValue({ id: "r", progressStatus: "APPROVED", approvalStatus: "APPROVED", ownerApprovalRequired: true, ownerApprovalStatus: "APPROVED" });
    mockDb.fleetMechanic.findFirst.mockResolvedValue({ id: "mech-1", name: "Kojo" });
    await fleet.assignMaintenanceMechanic(ORG, "r", "actor", "mech-1");
    expect(mockDb.fleetMaintenanceRequest.update).toHaveBeenLastCalledWith({ where: { id: "r" }, data: { mechanicId: "mech-1", progressStatus: "ASSIGNED" } });

    // acceptMaintenanceAssignment: ASSIGNED -> SCHEDULED
    mockDb.fleetMechanic.findFirst.mockResolvedValue({ id: "mech-1", organizationId: ORG, userId: "mech-user" });
    mockDb.fleetMaintenanceRequest.findFirst.mockResolvedValue({ id: "r", progressStatus: "ASSIGNED", mechanicId: "mech-1" });
    const scheduledRepairAt = new Date("2026-09-05T00:00:00.000Z");
    await fleet.acceptMaintenanceAssignment(ORG, "r", "mech-user", scheduledRepairAt);
    expect(mockDb.fleetMaintenanceRequest.update).toHaveBeenLastCalledWith({ where: { id: "r" }, data: { scheduledRepairAt, progressStatus: "SCHEDULED" } });

    // startMaintenanceRepair: SCHEDULED -> IN_PROGRESS
    mockDb.fleetMaintenanceRequest.findFirst.mockResolvedValue({ id: "r", progressStatus: "SCHEDULED", vehicleId: "veh-1" });
    await fleet.startMaintenanceRepair(ORG, "r", "actor");
    expect(mockDb.fleetMaintenanceRequest.update).toHaveBeenLastCalledWith({ where: { id: "r" }, data: { progressStatus: "IN_PROGRESS" } });

    // holdMaintenanceRepair: IN_PROGRESS -> ON_HOLD
    mockDb.fleetMaintenanceRequest.findFirst.mockResolvedValue({ id: "r", progressStatus: "IN_PROGRESS" });
    await fleet.holdMaintenanceRepair(ORG, "r", "actor", "waiting on parts");
    expect(mockDb.fleetMaintenanceRequest.update).toHaveBeenLastCalledWith({ where: { id: "r" }, data: { progressStatus: "ON_HOLD" } });

    // resumeMaintenanceRepair: ON_HOLD -> IN_PROGRESS
    mockDb.fleetMaintenanceRequest.findFirst.mockResolvedValue({ id: "r", progressStatus: "ON_HOLD" });
    await fleet.resumeMaintenanceRepair(ORG, "r", "actor");
    expect(mockDb.fleetMaintenanceRequest.update).toHaveBeenLastCalledWith({ where: { id: "r" }, data: { progressStatus: "IN_PROGRESS" } });

    // completeMaintenanceRepair: IN_PROGRESS -> COMPLETED (no completionVerified field anymore)
    mockDb.fleetMaintenanceRequest.findFirst.mockResolvedValue({ id: "r", progressStatus: "IN_PROGRESS" });
    await fleet.completeMaintenanceRepair(ORG, "r", "actor", "150.00");
    const completeCall = mockDb.fleetMaintenanceRequest.update.mock.calls.at(-1)![0];
    expect(completeCall.data.progressStatus).toBe("COMPLETED");
    expect(completeCall.data).not.toHaveProperty("completionVerified");

    // verifyMaintenanceCompletion: COMPLETED -> VERIFIED
    mockDb.fleetMaintenanceRequest.findFirst.mockResolvedValue({ id: "r", progressStatus: "COMPLETED", vehicleId: "veh-1", vehicle: { assignedDriverId: null, owner: null, plateNumber: "GR-1", assetTag: "AST-1", ownerId: null } });
    await fleet.verifyMaintenanceCompletion(ORG, "r", "actor");
    const verifyCall = mockDb.fleetMaintenanceRequest.update.mock.calls.at(-1)![0];
    expect(verifyCall.data.progressStatus).toBe("VERIFIED");
    expect(verifyCall.data).not.toHaveProperty("completionVerified");
  });

  it("rejects starting a repair before the mechanic has scheduled it (still ASSIGNED, not SCHEDULED)", async () => {
    mockDb.fleetMaintenanceRequest.findFirst.mockResolvedValue({ id: "r", progressStatus: "ASSIGNED" });
    await expect(fleet.startMaintenanceRepair(ORG, "r", "actor")).rejects.toThrow(fleet.InvalidMaintenanceTransitionError);
    expect(mockDb.fleetMaintenanceRequest.update).not.toHaveBeenCalled();
  });

  it("rejects verifying a request that hasn't been marked complete yet", async () => {
    mockDb.fleetMaintenanceRequest.findFirst.mockResolvedValue({ id: "r", progressStatus: "IN_PROGRESS" });
    await expect(fleet.verifyMaintenanceCompletion(ORG, "r", "actor")).rejects.toThrow(fleet.InvalidMaintenanceTransitionError);
  });

  it("rejects verifying an already-verified request (no completionVerified flag needed - VERIFIED is its own status)", async () => {
    mockDb.fleetMaintenanceRequest.findFirst.mockResolvedValue({ id: "r", progressStatus: "VERIFIED" });
    await expect(fleet.verifyMaintenanceCompletion(ORG, "r", "actor")).rejects.toThrow(fleet.InvalidMaintenanceTransitionError);
  });
});

describe("withdrawMaintenanceRequest", () => {
  it.each(["REPORTED", "AWAITING_OWNER_APPROVAL", "APPROVED", "ASSIGNED", "SCHEDULED"])(
    "withdraws a request from %s to CANCELLED",
    async (progressStatus) => {
      mockDb.fleetMaintenanceRequest.findFirst.mockResolvedValue({ id: "r", progressStatus });
      await fleet.withdrawMaintenanceRequest(ORG, "r", "actor", "no longer needed");
      expect(mockDb.fleetMaintenanceRequest.update).toHaveBeenCalledWith({ where: { id: "r" }, data: { progressStatus: "CANCELLED" } });
    },
  );

  it.each(["IN_PROGRESS", "ON_HOLD", "COMPLETED", "VERIFIED", "REJECTED", "CANCELLED"])(
    "refuses to withdraw once a request has reached %s",
    async (progressStatus) => {
      mockDb.fleetMaintenanceRequest.findFirst.mockResolvedValue({ id: "r", progressStatus });
      await expect(fleet.withdrawMaintenanceRequest(ORG, "r", "actor")).rejects.toThrow(fleet.InvalidMaintenanceTransitionError);
      expect(mockDb.fleetMaintenanceRequest.update).not.toHaveBeenCalled();
    },
  );
});

describe("holdMaintenanceRepair / resumeMaintenanceRepair", () => {
  it("refuses to hold a repair that isn't in progress", async () => {
    mockDb.fleetMaintenanceRequest.findFirst.mockResolvedValue({ id: "r", progressStatus: "SCHEDULED" });
    await expect(fleet.holdMaintenanceRepair(ORG, "r", "actor")).rejects.toThrow(fleet.InvalidMaintenanceTransitionError);
  });

  it("refuses to resume a repair that isn't on hold", async () => {
    mockDb.fleetMaintenanceRequest.findFirst.mockResolvedValue({ id: "r", progressStatus: "IN_PROGRESS" });
    await expect(fleet.resumeMaintenanceRepair(ORG, "r", "actor")).rejects.toThrow(fleet.InvalidMaintenanceTransitionError);
  });
});

describe("Maintenance status enum and migration wiring", () => {
  const schema = fs.readFileSync("prisma/schema.prisma", "utf8");
  const migration1 = fs.readFileSync("prisma/migrations/20260830160000_fleet_maintenance_status_expansion/migration.sql", "utf8");
  const migration2 = fs.readFileSync("prisma/migrations/20260830160100_fleet_maintenance_status_backfill/migration.sql", "utf8");

  it("expands FleetMaintenanceProgressStatus to all 11 states and keeps REVIEWING for historical rows", () => {
    for (const value of ["REPORTED", "REVIEWING", "AWAITING_OWNER_APPROVAL", "APPROVED", "ASSIGNED", "SCHEDULED", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "VERIFIED", "REJECTED", "CANCELLED"]) {
      expect(schema).toContain(value);
    }
  });

  it("drops completionVerified in favor of the VERIFIED status", () => {
    expect(schema).not.toContain("completionVerified");
  });

  it("adds the new enum values additively, separate from the data backfill", () => {
    expect(migration1).toContain("ADD VALUE 'AWAITING_OWNER_APPROVAL'");
    expect(migration1).toContain("ADD VALUE 'ASSIGNED'");
    expect(migration1).toContain("ADD VALUE 'SCHEDULED'");
    expect(migration1).toContain("ADD VALUE 'ON_HOLD'");
    expect(migration1).toContain("ADD VALUE 'VERIFIED'");
    expect(migration1).toContain("ADD VALUE 'REJECTED'");
  });

  it("backfills REVIEWING, mechanic-assigned APPROVED rows, and verified COMPLETED rows before dropping the boolean", () => {
    expect(migration2).toContain("SET \"progressStatus\" = 'AWAITING_OWNER_APPROVAL' WHERE \"progressStatus\" = 'REVIEWING'");
    expect(migration2).toContain("SET \"progressStatus\" = 'ASSIGNED' WHERE \"progressStatus\" = 'APPROVED' AND \"mechanicId\" IS NOT NULL");
    expect(migration2).toContain("SET \"progressStatus\" = 'VERIFIED' WHERE \"progressStatus\" = 'COMPLETED' AND \"completionVerified\" = true");
    expect(migration2).toContain("SET \"progressStatus\" = 'REJECTED' WHERE \"progressStatus\" = 'CANCELLED'");
    expect(migration2).toContain("DROP COLUMN \"completionVerified\"");
  });
});

describe("Maintenance page UI wiring for the expanded state machine", () => {
  const maintenancePage = fs.readFileSync("src/app/app/fleet/maintenance/page.tsx", "utf8");
  const maintenanceActions = fs.readFileSync("src/app/app/fleet/maintenance/actions.ts", "utf8");
  const mechanicPortalPage = fs.readFileSync("src/app/app/fleet/mechanic-portal/page.tsx", "utf8");
  const statusModule = fs.readFileSync("src/modules/fleet/maintenance-status.ts", "utf8");

  it("shares one label/badge map across manager, driver, and mechanic surfaces", () => {
    const driverPortalPage = fs.readFileSync("src/app/app/fleet/driver-portal/page.tsx", "utf8");
    for (const page of [maintenancePage, driverPortalPage, mechanicPortalPage]) {
      expect(page).toContain("MAINTENANCE_PROGRESS_LABELS");
      expect(page).toContain("MAINTENANCE_PROGRESS_BADGE");
    }
    for (const value of ["ASSIGNED", "SCHEDULED", "ON_HOLD", "VERIFIED", "REJECTED"]) {
      expect(statusModule).toContain(value);
    }
  });

  it("only offers Start repair once the mechanic has scheduled a date (SCHEDULED, not APPROVED)", () => {
    expect(maintenancePage).toContain('request.progressStatus === "SCHEDULED"');
  });

  it("wires Hold, Resume, and Withdraw controls to their own actions", () => {
    expect(maintenancePage).toContain("holdRepair");
    expect(maintenancePage).toContain("resumeRepair");
    expect(maintenancePage).toContain("withdrawRequest");
    expect(maintenanceActions).toContain("holdMaintenanceRepair");
    expect(maintenanceActions).toContain("resumeMaintenanceRepair");
    expect(maintenanceActions).toContain("withdrawMaintenanceRequest");
  });

  it("only shows the mechanic's own schedule form while the assignment is still ASSIGNED, not once SCHEDULED", () => {
    expect(mechanicPortalPage).toContain('request.progressStatus === "ASSIGNED"');
  });
});
