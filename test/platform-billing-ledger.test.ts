import { describe, expect, it, vi } from "vitest";

const mockDb = {
  subscriptionPayment: { findMany: vi.fn() },
};

vi.mock("@/lib/db", () => ({ db: mockDb }));

const { getPaymentLedger, getPaymentTotals } = await import("@/platform/billing/service");

const BASE_PAYMENT = {
  id: "pay-1",
  organizationId: "org-1",
  status: "SUCCESS" as const,
  amount: "1000.00",
  currency: "GHS",
  invoiceCode: "INV-0001",
  gatewayProvider: "PAYSTACK",
  paidAt: new Date("2026-09-01T00:00:00Z"),
  failureReason: null,
  createdAt: new Date("2026-09-01T00:00:00Z"),
  organization: { name: "Tema Traders", tenantCode: "tema-traders" },
};

describe("getPaymentLedger", () => {
  it("reads the real per-payment ledger, joining the organization's own name rather than an id", async () => {
    mockDb.subscriptionPayment.findMany.mockResolvedValue([BASE_PAYMENT]);

    const ledger = await getPaymentLedger();

    expect(ledger).toEqual([{
      id: "pay-1",
      organizationId: "org-1",
      organizationName: "Tema Traders",
      tenantCode: "tema-traders",
      status: "SUCCESS",
      amount: 1000,
      currency: "GHS",
      invoiceCode: "INV-0001",
      gatewayProvider: "PAYSTACK",
      paidAt: new Date("2026-09-01T00:00:00Z"),
      failureReason: null,
      createdAt: new Date("2026-09-01T00:00:00Z"),
    }]);
  });

  it("filters to one organization when asked, and caps the take at 500 regardless of a larger requested limit", async () => {
    mockDb.subscriptionPayment.findMany.mockResolvedValue([]);

    await getPaymentLedger({ organizationId: "org-1", limit: 10_000 });

    expect(mockDb.subscriptionPayment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId: "org-1" },
      take: 500,
    }));
  });
});

describe("getPaymentTotals", () => {
  it("separates successful collections from failed attempts, per currency", async () => {
    mockDb.subscriptionPayment.findMany.mockResolvedValue([
      { status: "SUCCESS", amount: "1000.00", currency: "GHS" },
      { status: "SUCCESS", amount: "500.00", currency: "GHS" },
      { status: "FAILED", amount: "200.00", currency: "GHS" },
      { status: "SUCCESS", amount: "50.00", currency: "USD" },
    ]);

    const totals = await getPaymentTotals();

    expect(totals).toEqual({
      GHS: { collected: 1500, successCount: 2, failedAmount: 200, failedCount: 1 },
      USD: { collected: 50, successCount: 1, failedAmount: 0, failedCount: 0 },
    });
  });

  it("returns an empty object, not a fabricated zero-currency entry, when no payment has ever been recorded", async () => {
    mockDb.subscriptionPayment.findMany.mockResolvedValue([]);
    expect(await getPaymentTotals()).toEqual({});
  });
});
