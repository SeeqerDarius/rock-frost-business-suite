import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class NotFoundError extends Error {}
  class InvalidMaintenanceTransitionError extends Error {}
  class MaintenanceApprovalRequiredError extends Error {}
  class InvalidPaymentAmountError extends Error {}
  class FleetMechanicNotExternalError extends Error {}

  return {
    NotFoundError,
    InvalidMaintenanceTransitionError,
    MaintenanceApprovalRequiredError,
    InvalidPaymentAmountError,
    FleetMechanicNotExternalError,
    requireModuleAccess: vi.fn(),
    hasPermission: vi.fn(),
    getServerAuthSession: vi.fn(),
    verifyMaintenanceCompletion: vi.fn(),
    createFleetMaintenanceRequest: vi.fn(),
    managerReviewMaintenanceRequest: vi.fn(),
    recordMaintenanceEstimate: vi.fn(),
    ownerDecisionMaintenanceRequest: vi.fn(),
    assignMaintenanceMechanic: vi.fn(),
    scheduleExternalMaintenanceRepair: vi.fn(),
    startMaintenanceRepair: vi.fn(),
    holdMaintenanceRepair: vi.fn(),
    resumeMaintenanceRepair: vi.fn(),
    withdrawMaintenanceRequest: vi.fn(),
    completeMaintenanceRepair: vi.fn(),
    correctVerifiedMaintenanceExpense: vi.fn(),
    canUserReportFleetVehicle: vi.fn(),
    logAuditEvent: vi.fn(),
    revalidatePath: vi.fn(),
    redirect: vi.fn(),
    postModuleExpense: vi.fn(),
    reverseModuleExpense: vi.fn(),
  };
});

class RedirectSignal extends Error {
  constructor(readonly location: string) {
    super(`redirect:${location}`);
  }
}

vi.mock("@/lib/auth/module-access", () => ({ requireModuleAccess: mocks.requireModuleAccess }));
vi.mock("@/lib/auth/permissions", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/permissions")>("@/lib/auth/permissions");
  return { ...actual, hasPermission: mocks.hasPermission };
});
vi.mock("@/lib/auth/session", () => ({ getServerAuthSession: mocks.getServerAuthSession }));
vi.mock("@/lib/audit", () => ({ logAuditEvent: mocks.logAuditEvent }));
vi.mock("@/lib/fleet-maintenance-photo", () => ({ fleetMaintenancePhotoData: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/accounting-integration", () => ({ postModuleExpense: mocks.postModuleExpense, reverseModuleExpense: mocks.reverseModuleExpense }));
vi.mock("@/modules/fleet/service", () => ({
  createFleetMaintenanceRequest: mocks.createFleetMaintenanceRequest,
  MAX_FLEET_MAINTENANCE_ATTACHMENTS: 5,
  managerReviewMaintenanceRequest: mocks.managerReviewMaintenanceRequest,
  recordMaintenanceEstimate: mocks.recordMaintenanceEstimate,
  ownerDecisionMaintenanceRequest: mocks.ownerDecisionMaintenanceRequest,
  assignMaintenanceMechanic: mocks.assignMaintenanceMechanic,
  scheduleExternalMaintenanceRepair: mocks.scheduleExternalMaintenanceRepair,
  startMaintenanceRepair: mocks.startMaintenanceRepair,
  holdMaintenanceRepair: mocks.holdMaintenanceRepair,
  resumeMaintenanceRepair: mocks.resumeMaintenanceRepair,
  withdrawMaintenanceRequest: mocks.withdrawMaintenanceRequest,
  completeMaintenanceRepair: mocks.completeMaintenanceRepair,
  verifyMaintenanceCompletion: mocks.verifyMaintenanceCompletion,
  correctVerifiedMaintenanceExpense: mocks.correctVerifiedMaintenanceExpense,
  NotFoundError: mocks.NotFoundError,
  InvalidMaintenanceTransitionError: mocks.InvalidMaintenanceTransitionError,
  MaintenanceApprovalRequiredError: mocks.MaintenanceApprovalRequiredError,
  InvalidPaymentAmountError: mocks.InvalidPaymentAmountError,
  FleetMechanicNotExternalError: mocks.FleetMechanicNotExternalError,
  canUserReportFleetVehicle: mocks.canUserReportFleetVehicle,
}));

const { verifyRepairCompletion, correctRepairExpense, scheduleExternalRepair } = await import("@/app/app/fleet/maintenance/actions");

const ORG = "org-1";
const TENANT = { organizationId: ORG, userId: "user-1" };

function verifyForm() {
  const formData = new FormData();
  formData.set("id", "request-1");
  return formData;
}

function decimalLike(value: string) {
  return { toString: () => value, isZero: () => Number(value) === 0 };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireModuleAccess.mockResolvedValue(TENANT);
  mocks.hasPermission.mockReturnValue(true);
  mocks.getServerAuthSession.mockResolvedValue({ user: { id: TENANT.userId, name: "Manager", email: "manager@example.com" } });
  mocks.redirect.mockImplementation((location: string) => {
    throw new RedirectSignal(location);
  });
  mocks.postModuleExpense.mockResolvedValue({ posted: true, journalEntryId: "journal-1" });
  mocks.reverseModuleExpense.mockResolvedValue({ posted: true, journalEntryId: "journal-reversed" });
});

function expectRedirect(result: Promise<void>, location: string) {
  return expect(result).rejects.toMatchObject({ location });
}

describe("verifyRepairCompletion Accounting integration wiring (Phase D5, end-to-end through the Action layer)", () => {
  it("posts the verified repair's cost to Accounting as a Fleet Maintenance Expense once verification succeeds", async () => {
    mocks.verifyMaintenanceCompletion.mockResolvedValue({
      id: "request-1",
      repairCost: decimalLike("450.00"),
      branchId: "branch-1",
      completedAt: new Date("2026-08-25"),
      vehicle: { plateNumber: "GR-1" },
    });

    await expectRedirect(verifyRepairCompletion(verifyForm()), "/app/fleet/maintenance?saved=1");

    expect(mocks.verifyMaintenanceCompletion).toHaveBeenCalledWith(ORG, "request-1", TENANT.userId);
    expect(mocks.postModuleExpense).toHaveBeenCalledWith(ORG, expect.objectContaining({
      sourceModule: "fleet",
      sourceType: "FLEET_MAINTENANCE_REPAIR",
      sourceId: "request-1",
      postingPurpose: "VERIFIED",
      amount: "450.00",
      branchId: "branch-1",
    }));
    expect(mocks.logAuditEvent).toHaveBeenCalled();
  });

  it("posts nothing when the verified repair carried no cost (e.g. warranty work)", async () => {
    mocks.verifyMaintenanceCompletion.mockResolvedValue({
      id: "request-1",
      repairCost: null,
      branchId: null,
      completedAt: new Date("2026-08-25"),
      vehicle: { plateNumber: "GR-1" },
    });

    await expectRedirect(verifyRepairCompletion(verifyForm()), "/app/fleet/maintenance?saved=1");

    expect(mocks.postModuleExpense).not.toHaveBeenCalled();
  });

  it("posts nothing when the verified repair's cost is exactly zero, not a zero-amount entry", async () => {
    mocks.verifyMaintenanceCompletion.mockResolvedValue({
      id: "request-1",
      repairCost: decimalLike("0.00"),
      branchId: null,
      completedAt: new Date("2026-08-25"),
      vehicle: { plateNumber: "GR-1" },
    });

    await expectRedirect(verifyRepairCompletion(verifyForm()), "/app/fleet/maintenance?saved=1");

    expect(mocks.postModuleExpense).not.toHaveBeenCalled();
  });

  it("never calls Accounting when verification itself fails (invalid transition)", async () => {
    mocks.verifyMaintenanceCompletion.mockRejectedValue(new mocks.InvalidMaintenanceTransitionError("not completed"));

    await expectRedirect(verifyRepairCompletion(verifyForm()), "/app/fleet/maintenance?error=invalid-transition");

    expect(mocks.postModuleExpense).not.toHaveBeenCalled();
  });
});

describe("correctRepairExpense Accounting integration wiring (Track 4, end-to-end through the Action layer)", () => {
  function correctionForm(overrides: Record<string, string> = {}) {
    const formData = new FormData();
    formData.set("id", "request-1");
    formData.set("newCost", overrides.newCost ?? "350.00");
    formData.set("reason", overrides.reason ?? "Workshop revised the final invoice");
    return formData;
  }

  it("reverses the original VERIFIED posting and posts the corrected cost under a distinct postingPurpose", async () => {
    mocks.correctVerifiedMaintenanceExpense.mockResolvedValue({
      request: { id: "request-1", repairCost: decimalLike("350.00"), branchId: "branch-1", vehicle: { plateNumber: "GR-1" } },
      previousCost: decimalLike("300.00"),
    });

    await expectRedirect(correctRepairExpense(correctionForm()), "/app/fleet/maintenance?saved=1");

    expect(mocks.correctVerifiedMaintenanceExpense).toHaveBeenCalledWith(ORG, "request-1", TENANT.userId, "350.00", "Workshop revised the final invoice");
    expect(mocks.reverseModuleExpense).toHaveBeenCalledWith(ORG, expect.objectContaining({
      sourceType: "FLEET_MAINTENANCE_REPAIR",
      sourceId: "request-1",
      postingPurpose: "VERIFIED",
      actorId: TENANT.userId,
    }));
    expect(mocks.postModuleExpense).toHaveBeenCalledWith(ORG, expect.objectContaining({
      sourceModule: "fleet",
      sourceType: "FLEET_MAINTENANCE_REPAIR",
      sourceId: "request-1",
      amount: "350.00",
      branchId: "branch-1",
    }));
    // The corrected posting must never reuse the original "VERIFIED"
    // postingPurpose - the idempotency tuple would collide with the entry
    // just reversed, and postSourceJournalEntry would silently return the
    // (now-reversed) original instead of creating a new one.
    const postCall = mocks.postModuleExpense.mock.calls[0][1];
    expect(postCall.postingPurpose).not.toBe("VERIFIED");
    expect(postCall.postingPurpose).toMatch(/^VERIFIED_CORRECTED_/);
    expect(mocks.logAuditEvent).toHaveBeenCalled();
  });

  it("reverses but does not repost when the corrected cost is zero", async () => {
    mocks.correctVerifiedMaintenanceExpense.mockResolvedValue({
      request: { id: "request-1", repairCost: decimalLike("0.00"), branchId: null, vehicle: { plateNumber: "GR-1" } },
      previousCost: decimalLike("300.00"),
    });

    await expectRedirect(correctRepairExpense(correctionForm({ newCost: "0.00" })), "/app/fleet/maintenance?saved=1");

    expect(mocks.reverseModuleExpense).toHaveBeenCalled();
    expect(mocks.postModuleExpense).not.toHaveBeenCalled();
  });

  it("never touches Accounting when the correction itself fails (not verified)", async () => {
    mocks.correctVerifiedMaintenanceExpense.mockRejectedValue(new mocks.InvalidMaintenanceTransitionError("not verified"));

    await expectRedirect(correctRepairExpense(correctionForm()), "/app/fleet/maintenance?error=invalid-transition");

    expect(mocks.reverseModuleExpense).not.toHaveBeenCalled();
    expect(mocks.postModuleExpense).not.toHaveBeenCalled();
  });
});

describe("scheduleExternalRepair Action-layer wiring", () => {
  it("maps FleetMechanicNotExternalError to a clear redirect", async () => {
    mocks.scheduleExternalMaintenanceRepair.mockRejectedValue(new mocks.FleetMechanicNotExternalError("has a login"));
    const formData = new FormData();
    formData.set("id", "request-1");
    formData.set("scheduledRepairAt", "2026-09-10");

    await expectRedirect(scheduleExternalRepair(formData), "/app/fleet/maintenance?error=mechanic-not-external");
  });
});
