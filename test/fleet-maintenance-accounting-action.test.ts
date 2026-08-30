import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class NotFoundError extends Error {}
  class InvalidMaintenanceTransitionError extends Error {}
  class MaintenanceApprovalRequiredError extends Error {}
  class InvalidPaymentAmountError extends Error {}

  return {
    NotFoundError,
    InvalidMaintenanceTransitionError,
    MaintenanceApprovalRequiredError,
    InvalidPaymentAmountError,
    requireModuleAccess: vi.fn(),
    hasPermission: vi.fn(),
    getServerAuthSession: vi.fn(),
    verifyMaintenanceCompletion: vi.fn(),
    createFleetMaintenanceRequest: vi.fn(),
    managerReviewMaintenanceRequest: vi.fn(),
    ownerDecisionMaintenanceRequest: vi.fn(),
    assignMaintenanceMechanic: vi.fn(),
    startMaintenanceRepair: vi.fn(),
    holdMaintenanceRepair: vi.fn(),
    resumeMaintenanceRepair: vi.fn(),
    withdrawMaintenanceRequest: vi.fn(),
    completeMaintenanceRepair: vi.fn(),
    canUserReportFleetVehicle: vi.fn(),
    logAuditEvent: vi.fn(),
    revalidatePath: vi.fn(),
    redirect: vi.fn(),
    postModuleExpense: vi.fn(),
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
vi.mock("@/lib/accounting-integration", () => ({ postModuleExpense: mocks.postModuleExpense }));
vi.mock("@/modules/fleet/service", () => ({
  createFleetMaintenanceRequest: mocks.createFleetMaintenanceRequest,
  MAX_FLEET_MAINTENANCE_ATTACHMENTS: 5,
  managerReviewMaintenanceRequest: mocks.managerReviewMaintenanceRequest,
  ownerDecisionMaintenanceRequest: mocks.ownerDecisionMaintenanceRequest,
  assignMaintenanceMechanic: mocks.assignMaintenanceMechanic,
  startMaintenanceRepair: mocks.startMaintenanceRepair,
  holdMaintenanceRepair: mocks.holdMaintenanceRepair,
  resumeMaintenanceRepair: mocks.resumeMaintenanceRepair,
  withdrawMaintenanceRequest: mocks.withdrawMaintenanceRequest,
  completeMaintenanceRepair: mocks.completeMaintenanceRepair,
  verifyMaintenanceCompletion: mocks.verifyMaintenanceCompletion,
  NotFoundError: mocks.NotFoundError,
  InvalidMaintenanceTransitionError: mocks.InvalidMaintenanceTransitionError,
  MaintenanceApprovalRequiredError: mocks.MaintenanceApprovalRequiredError,
  InvalidPaymentAmountError: mocks.InvalidPaymentAmountError,
  canUserReportFleetVehicle: mocks.canUserReportFleetVehicle,
}));

const { verifyRepairCompletion } = await import("@/app/app/fleet/maintenance/actions");

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
