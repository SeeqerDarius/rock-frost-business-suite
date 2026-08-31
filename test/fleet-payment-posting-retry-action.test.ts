import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => {
  class NotFoundError extends Error {}
  class FleetPaymentNotPostableError extends Error {}

  return {
    NotFoundError,
    FleetPaymentNotPostableError,
    requireModuleAccess: vi.fn(),
    hasPermission: vi.fn(),
    createFleetPayment: vi.fn(),
    updateFleetPaymentStatus: vi.fn(),
    reviewFleetDriverPaymentSubmission: vi.fn(),
    getFleetPaymentForPostingRetry: vi.fn(),
    postVerifiedFleetPaymentRevenue: vi.fn(),
    reverseModuleRevenue: vi.fn(),
    revalidatePath: vi.fn(),
    redirect: vi.fn(),
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
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/accounting-integration", () => ({ reverseModuleRevenue: mocks.reverseModuleRevenue }));
vi.mock("@/modules/fleet/accounting", () => ({ postVerifiedFleetPaymentRevenue: mocks.postVerifiedFleetPaymentRevenue }));
vi.mock("@/modules/fleet/service", () => ({
  createFleetPayment: mocks.createFleetPayment,
  updateFleetPaymentStatus: mocks.updateFleetPaymentStatus,
  reviewFleetDriverPaymentSubmission: mocks.reviewFleetDriverPaymentSubmission,
  getFleetPaymentForPostingRetry: mocks.getFleetPaymentForPostingRetry,
  NotFoundError: mocks.NotFoundError,
  FleetPaymentNotPostableError: mocks.FleetPaymentNotPostableError,
}));

const { retryPaymentPosting } = await import("@/app/app/fleet/payments/actions");

const ORG = "org-1";
const TENANT = { organizationId: ORG, userId: "user-1" };

function retryForm(id = "payment-1") {
  const formData = new FormData();
  formData.set("id", id);
  return formData;
}

function expectRedirect(result: Promise<void>, location: string) {
  return expect(result).rejects.toMatchObject({ location });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireModuleAccess.mockResolvedValue(TENANT);
  mocks.hasPermission.mockReturnValue(true);
  mocks.redirect.mockImplementation((location: string) => {
    throw new RedirectSignal(location);
  });
});

describe("retryPaymentPosting Action", () => {
  it("redirects not-found when the payment doesn't exist", async () => {
    mocks.getFleetPaymentForPostingRetry.mockRejectedValue(new mocks.NotFoundError("Payment not found."));
    await expectRedirect(retryPaymentPosting(retryForm()), "/app/fleet/payments?error=not-found");
    expect(mocks.postVerifiedFleetPaymentRevenue).not.toHaveBeenCalled();
  });

  it("redirects not-postable when the payment isn't verified", async () => {
    mocks.getFleetPaymentForPostingRetry.mockRejectedValue(new mocks.FleetPaymentNotPostableError("Only a verified payment can be posted."));
    await expectRedirect(retryPaymentPosting(retryForm()), "/app/fleet/payments?error=not-postable");
    expect(mocks.postVerifiedFleetPaymentRevenue).not.toHaveBeenCalled();
  });

  it("re-attempts posting for a FAILED payment and redirects saved=1", async () => {
    mocks.getFleetPaymentForPostingRetry.mockResolvedValue({ id: "payment-1", reference: "REF-1", type: "WEEKLY_SALES", amount: "500.00", date: new Date(), postingStatus: "FAILED" });
    mocks.postVerifiedFleetPaymentRevenue.mockResolvedValue({ posted: true, journalEntryId: "journal-1" });

    await expectRedirect(retryPaymentPosting(retryForm()), "/app/fleet/payments?saved=1");

    expect(mocks.postVerifiedFleetPaymentRevenue).toHaveBeenCalledWith(
      ORG,
      expect.objectContaining({ id: "payment-1" }),
      expect.stringContaining("REF-1"),
      TENANT.userId,
    );
  });

  it("does not re-post a payment that is already POSTED", async () => {
    mocks.getFleetPaymentForPostingRetry.mockResolvedValue({ id: "payment-1", reference: "REF-1", type: "WEEKLY_SALES", amount: "500.00", date: new Date(), postingStatus: "POSTED" });

    await expectRedirect(retryPaymentPosting(retryForm()), "/app/fleet/payments?saved=1");

    expect(mocks.postVerifiedFleetPaymentRevenue).not.toHaveBeenCalled();
  });

  it("rejects when the caller lacks payment-management permission", async () => {
    mocks.hasPermission.mockReturnValue(false);
    await expectRedirect(retryPaymentPosting(retryForm()), "/app/fleet/payments?error=forbidden");
    expect(mocks.getFleetPaymentForPostingRetry).not.toHaveBeenCalled();
  });
});
