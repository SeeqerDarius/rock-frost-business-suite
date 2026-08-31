import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = {
  fleetPayment: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
};
vi.mock("@/lib/db", () => ({ db: mockDb }));

const mocks = vi.hoisted(() => ({ postModuleRevenue: vi.fn() }));
vi.mock("@/lib/accounting-integration", async () => {
  const actual = await vi.importActual<typeof import("@/lib/accounting-integration")>("@/lib/accounting-integration");
  return { ...actual, postModuleRevenue: mocks.postModuleRevenue };
});

const service = await import("@/modules/fleet/service");
const accounting = await import("@/modules/fleet/accounting");

const ORG = "org-1";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("postVerifiedFleetPaymentRevenue posting-status and receipt tracking", () => {
  const PAYMENT = { id: "payment-1", amount: "500.00", date: new Date("2026-08-20") };

  it("marks the payment POSTED and generates a receipt number on a successful posting", async () => {
    mocks.postModuleRevenue.mockResolvedValue({ posted: true, journalEntryId: "journal-1" });
    mockDb.fleetPayment.findUnique.mockResolvedValue({ receiptNumber: null });

    await accounting.postVerifiedFleetPaymentRevenue(ORG, PAYMENT, "Fleet payment verified", "user-1");

    expect(mockDb.fleetPayment.update).toHaveBeenCalledWith({
      where: { id: "payment-1" },
      data: { postingStatus: "POSTED", receiptNumber: expect.stringMatching(/^RF-\d{4}-/) },
    });
  });

  it("marks the payment FAILED, but still generates a receipt number, when the posting attempt errors", async () => {
    mocks.postModuleRevenue.mockResolvedValue({ posted: false, reason: "error" });
    mockDb.fleetPayment.findUnique.mockResolvedValue({ receiptNumber: null });

    await accounting.postVerifiedFleetPaymentRevenue(ORG, PAYMENT, "Fleet payment verified", "user-1");

    expect(mockDb.fleetPayment.update).toHaveBeenCalledWith({
      where: { id: "payment-1" },
      data: { postingStatus: "FAILED", receiptNumber: expect.stringMatching(/^RF-\d{4}-/) },
    });
  });

  it("treats accounting-not-enabled as POSTED - nothing to retry when Accounting isn't active", async () => {
    mocks.postModuleRevenue.mockResolvedValue({ posted: false, reason: "accounting-not-enabled" });
    mockDb.fleetPayment.findUnique.mockResolvedValue({ receiptNumber: null });

    await accounting.postVerifiedFleetPaymentRevenue(ORG, PAYMENT, "Fleet payment verified", "user-1");

    expect(mockDb.fleetPayment.update).toHaveBeenCalledWith({
      where: { id: "payment-1" },
      data: { postingStatus: "POSTED", receiptNumber: expect.stringMatching(/^RF-\d{4}-/) },
    });
  });

  it("reuses an existing receipt number instead of generating a new one on a retry", async () => {
    mocks.postModuleRevenue.mockResolvedValue({ posted: true, journalEntryId: "journal-2" });
    mockDb.fleetPayment.findUnique.mockResolvedValue({ receiptNumber: "RF-2026-EXISTING1" });

    await accounting.postVerifiedFleetPaymentRevenue(ORG, PAYMENT, "Fleet payment posting retried", "user-1");

    expect(mockDb.fleetPayment.update).toHaveBeenCalledWith({
      where: { id: "payment-1" },
      data: { postingStatus: "POSTED", receiptNumber: "RF-2026-EXISTING1" },
    });
  });
});

describe("getFleetPaymentForPostingRetry", () => {
  it("rejects a payment id that doesn't exist in this organization", async () => {
    mockDb.fleetPayment.findFirst.mockResolvedValue(null);
    await expect(service.getFleetPaymentForPostingRetry(ORG, "payment-foreign")).rejects.toThrow(service.NotFoundError);
  });

  it("rejects a payment that isn't VERIFIED", async () => {
    mockDb.fleetPayment.findFirst.mockResolvedValue({ id: "payment-1", status: "PENDING", postingStatus: "PENDING" });
    await expect(service.getFleetPaymentForPostingRetry(ORG, "payment-1")).rejects.toThrow(service.FleetPaymentNotPostableError);
  });

  it("returns the payment when it is VERIFIED", async () => {
    const payment = { id: "payment-1", status: "VERIFIED", postingStatus: "FAILED" };
    mockDb.fleetPayment.findFirst.mockResolvedValue(payment);
    await expect(service.getFleetPaymentForPostingRetry(ORG, "payment-1")).resolves.toEqual(payment);
  });
});
