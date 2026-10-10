import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ postModuleRevenue: vi.fn(), updateMany: vi.fn() }));
vi.mock("@/lib/accounting-integration", () => ({ postModuleRevenue: mocks.postModuleRevenue }));
vi.mock("@/lib/db", () => ({ db: { schoolFeePayment: { updateMany: mocks.updateMany } } }));

const { postSchoolFeePaymentRevenue } = await import("@/modules/school/accounting");

const payment = { id: "payment-1", amount: { toString: () => "100.00" }, receivedAt: new Date("2026-09-15T10:00:00Z"), receiptNumber: "SCH-0001" };

beforeEach(() => vi.clearAllMocks());

describe("School fee payment Accounting delivery", () => {
  it("marks a successfully posted payment as POSTED", async () => {
    mocks.postModuleRevenue.mockResolvedValue({ posted: true, journalEntryId: "journal-1" });
    await postSchoolFeePaymentRevenue("org-1", payment, "user-1");
    expect(mocks.postModuleRevenue).toHaveBeenCalledWith("org-1", expect.objectContaining({ sourceType: "SCHOOL_FEE_PAYMENT", sourceId: "payment-1", postingPurpose: "COLLECTED", amount: "100.00" }));
    expect(mocks.updateMany).toHaveBeenCalledWith({ where: { id: "payment-1", organizationId: "org-1" }, data: { postingStatus: "POSTED" } });
  });

  it("records an Accounting failure without changing the source payment", async () => {
    mocks.postModuleRevenue.mockResolvedValue({ posted: false, reason: "error" });
    await postSchoolFeePaymentRevenue("org-1", payment, "user-1");
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { postingStatus: "FAILED" } }));
  });

  it("marks an inactive Accounting module as not required and supports later retry", async () => {
    mocks.postModuleRevenue.mockResolvedValue({ posted: false, reason: "accounting-not-enabled" });
    await postSchoolFeePaymentRevenue("org-1", payment, "user-1");
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { postingStatus: "NOT_REQUIRED" } }));
  });
});
