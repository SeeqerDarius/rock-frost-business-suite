import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getAccountBalancesAsOf: vi.fn(),
  getCashFlowStatement: vi.fn(),
  listSupplierInvoices: vi.fn(),
}));

vi.mock("@/modules/accounting/service", () => ({
  getAccountBalancesAsOf: mocks.getAccountBalancesAsOf,
  getCashFlowStatement: mocks.getCashFlowStatement,
  NON_POSTED_JOURNAL_STATUSES: ["PENDING_APPROVAL", "REJECTED"],
}));
vi.mock("@/modules/procurement/service", () => ({ listSupplierInvoices: mocks.listSupplierInvoices }));

const mockDb = {
  accountingJournalEntry: { findMany: vi.fn() },
  accountingInvoice: { aggregate: vi.fn(), findMany: vi.fn() },
  accountingBill: { findMany: vi.fn() },
  accountingCreditNote: { findMany: vi.fn() },
  accountingAccount: { findMany: vi.fn() },
};
vi.mock("@/lib/db", () => ({ db: mockDb }));

const dashboard = await import("@/modules/accounting/dashboard-service");

const ORG = "org-1";
// Jan 1-30, 2026 local time - safely clear of any DST transition, and
// resolveDashboardPeriod("month", NOW) always yields exactly 30 elapsed days,
// used throughout the fixture below (average-debtor/payable-day math).
const NOW = new Date(2026, 0, 30, 12, 0, 0, 0);

const ACCOUNTS_AT_END = [
  { id: "cash", code: "1000", name: "Cash", type: "ASSET" as const, liquidityType: "CASH" as const, balance: 12_000 },
  { id: "bank", code: "1010", name: "Bank", type: "ASSET" as const, liquidityType: "BANK" as const, balance: 15_000 },
  { id: "ar", code: "1100", name: "Accounts Receivable", type: "ASSET" as const, liquidityType: "NONE" as const, balance: 5_000 },
  { id: "equipment", code: "1500", name: "Equipment", type: "ASSET" as const, liquidityType: "NONE" as const, balance: 10_000 },
  { id: "ap", code: "2000", name: "Accounts Payable", type: "LIABILITY" as const, liquidityType: "NONE" as const, balance: 5_000 },
  { id: "loan", code: "2400", name: "Short-Term Loan", type: "LIABILITY" as const, liquidityType: "NONE" as const, balance: 10_000 },
  { id: "capital", code: "3000", name: "Owner's Capital", type: "EQUITY" as const, liquidityType: "NONE" as const, balance: 20_000 },
];
// Total assets 42,000; total liabilities 15,000; stated equity 20,000.
// Revenue 25,000 / Expenses 18,000 -> net income 7,000 -> total equity 27,000.
// 42,000 = 15,000 + 27,000. ✓

const ACCOUNTS_AT_START = [
  { id: "ar", code: "1100", name: "Accounts Receivable", type: "ASSET" as const, liquidityType: "NONE" as const, balance: 3_000 },
  { id: "ap", code: "2000", name: "Accounts Payable", type: "LIABILITY" as const, liquidityType: "NONE" as const, balance: 4_000 },
];
// Average receivable (3,000+5,000)/2 = 4,000. Average payable (4,000+5,000)/2 = 4,500.

const CASH_FLOW = { from: NOW, to: NOW, operating: 8_000, investing: 0, financing: 0, netChange: 8_000, openingCash: 0, closingCash: 8_000, cashReceived: 30_000, cashSpent: 22_000 };

const JOURNAL_ENTRIES = [
  { lines: [{ debit: "0.00", credit: "25000.00", account: { type: "REVENUE" } }, { debit: "18000.00", credit: "0.00", account: { type: "EXPENSE" } }] },
];

function seedOnePeriod() {
  mocks.getAccountBalancesAsOf.mockResolvedValueOnce(ACCOUNTS_AT_END).mockResolvedValueOnce(ACCOUNTS_AT_START);
  mocks.getCashFlowStatement.mockResolvedValueOnce(CASH_FLOW);
  mockDb.accountingJournalEntry.findMany.mockResolvedValueOnce(JOURNAL_ENTRIES);
  mockDb.accountingInvoice.aggregate.mockResolvedValueOnce({ _sum: { amount: "25000.00" } });
  mockDb.accountingBill.findMany.mockResolvedValueOnce([{ amount: "18000.00" }]);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listSupplierInvoices.mockResolvedValue([]);
});

describe("resolveDashboardPeriod and priorPeriodOf", () => {
  it("resolves a month preset to start-of-month through end of now", () => {
    const period = dashboard.resolveDashboardPeriod("month", NOW);
    expect(period.from).toEqual(new Date(2026, 0, 1, 0, 0, 0, 0));
    expect(period.to).toEqual(new Date(2026, 0, 30, 23, 59, 59, 999));
  });

  it("compares to-date vs prior-unit-to-date, not a raw duration shift", () => {
    const current = dashboard.resolveDashboardPeriod("month", NOW);
    const prior = dashboard.priorPeriodOf(current, "month");
    // Jan 1-30 (30 days) compares against Dec 1-30 (also 30 days), not Dec 1-31.
    expect(prior.from).toEqual(new Date(2025, 11, 1, 0, 0, 0, 0));
    expect(prior.to).toEqual(new Date(2025, 11, 30, 23, 59, 59, 999));
  });

  it("resolves a quarter preset to start-of-quarter", () => {
    const period = dashboard.resolveDashboardPeriod("quarter", new Date(2026, 4, 15));
    expect(period.from).toEqual(new Date(2026, 3, 1, 0, 0, 0, 0)); // Q2 starts in April
  });
});

describe("getFinancialBenchmarks: ratio formulas against a hand-computed fixture", () => {
  it("computes every gauge correctly and bands its tone", async () => {
    seedOnePeriod();

    const result = await dashboard.getFinancialBenchmarks(ORG, "month", "GHS", NOW);
    const byKey = Object.fromEntries(result.gauges.map((g) => [g.key, g]));

    expect(byKey.grossProfitMargin.value).toBeCloseTo(100, 5); // Cost of revenue = 0
    expect(byKey.grossProfitMargin.tone).toBe("green");
    expect(byKey.netProfitMargin.value).toBeCloseTo(28, 5); // 7,000 / 25,000
    expect(byKey.operatingMargin.value).toBeCloseTo(28, 5); // v1: equals net margin
    expect(byKey.debtToEquity.value).toBeCloseTo(15_000 / 27_000, 5);
    expect(byKey.debtToEquity.tone).toBe("green"); // < 1
    expect(byKey.currentRatio.value).toBeCloseTo(42_000 / 15_000, 5); // 2.8
    expect(byKey.currentRatio.tone).toBe("green");
    expect(byKey.cashFlowRatio.value).toBeCloseTo(8_000 / 15_000, 5);
    expect(byKey.workingCapital.value).toBeCloseTo(27_000, 2); // 42,000 - 15,000
    expect(byKey.quickRatio.value).toBeCloseTo((12_000 + 15_000 + 5_000) / 15_000, 5); // 2.1333...
    expect(byKey.averageDebtorDays.value).toBeCloseTo((4_000 / 25_000) * 30, 4); // 4.8 days
    expect(byKey.averagePayableDays.value).toBeCloseTo((4_500 / 18_000) * 30, 4); // 7.5 days
  });

  it("renders null, not Infinity or NaN, when a ratio's denominator is zero", async () => {
    mocks.getAccountBalancesAsOf.mockResolvedValueOnce([]).mockResolvedValueOnce([]); // no accounts at all -> zero liabilities/equity/income
    mocks.getCashFlowStatement.mockResolvedValueOnce({ ...CASH_FLOW, operating: 0, cashReceived: 0, cashSpent: 0 });
    mockDb.accountingJournalEntry.findMany.mockResolvedValueOnce([]);
    mockDb.accountingInvoice.aggregate.mockResolvedValueOnce({ _sum: { amount: null } });
    mockDb.accountingBill.findMany.mockResolvedValueOnce([]);

    const result = await dashboard.getFinancialBenchmarks(ORG, "month", "GHS", NOW);
    const byKey = Object.fromEntries(result.gauges.map((g) => [g.key, g]));

    expect(byKey.netProfitMargin.value).toBeNull();
    expect(byKey.netProfitMargin.displayValue).toBe("Not available");
    expect(byKey.netProfitMargin.tone).toBe("neutral");
    expect(byKey.debtToEquity.value).toBeNull();
    expect(byKey.averageDebtorDays.value).toBeNull();
  });
});

describe("getFinancialComparison: current vs prior period, with the correct out-of-scope rows", () => {
  it("computes representative current/prior figures and never fabricates the three unsupported solvency rows", async () => {
    // Concurrent Promise.all([computePeriodFinancials(current), computePeriodFinancials(prior)])
    // invokes each mocked dependency for the current period first, then the prior period,
    // since each async call synchronously reaches its own internal Promise.all before yielding.
    seedOnePeriod(); // current period: the same fixture as getFinancialBenchmarks's test
    mocks.getAccountBalancesAsOf
      .mockResolvedValueOnce([ // prior period end: smaller org, independently chosen
        { id: "ar", code: "1100", type: "ASSET", liquidityType: "NONE", balance: 3_000 },
        { id: "cash", code: "1000", type: "ASSET", liquidityType: "CASH", balance: 20_000 },
        { id: "ap", code: "2000", type: "LIABILITY", liquidityType: "NONE", balance: 4_000 },
        { id: "loan", code: "2400", type: "LIABILITY", liquidityType: "NONE", balance: 10_000 },
        { id: "capital", code: "3000", type: "EQUITY", liquidityType: "NONE", balance: 20_000 },
        { id: "equipment", code: "1500", type: "ASSET", liquidityType: "NONE", balance: 12_000 },
      ])
      .mockResolvedValueOnce([ // prior period start boundary
        { id: "ar", code: "1100", type: "ASSET", liquidityType: "NONE", balance: 2_000 },
        { id: "ap", code: "2000", type: "LIABILITY", liquidityType: "NONE", balance: 3_000 },
      ]);
    mocks.getCashFlowStatement.mockResolvedValueOnce({ ...CASH_FLOW, operating: 5_000, cashReceived: 24_000, cashSpent: 19_000 });
    mockDb.accountingJournalEntry.findMany.mockResolvedValueOnce([
      { lines: [{ debit: "0.00", credit: "20000.00", account: { type: "REVENUE" } }, { debit: "16000.00", credit: "0.00", account: { type: "EXPENSE" } }] },
    ]);
    mockDb.accountingInvoice.aggregate.mockResolvedValueOnce({ _sum: { amount: "20000.00" } });
    mockDb.accountingBill.findMany.mockResolvedValueOnce([{ amount: "16000.00" }]);

    const result = await dashboard.getFinancialComparison(ORG, "month", NOW);

    const income = result.profitability.find((r) => r.label === "Income")!;
    expect(income.current).toBeCloseTo(25_000, 2);
    expect(income.prior).toBeCloseTo(20_000, 2); // +25% relative change

    const netProfitMargin = result.performance.find((r) => r.label === "Net profit margin")!;
    expect(netProfitMargin.current).toBeCloseTo(28, 4); // 7,000/25,000
    expect(netProfitMargin.prior).toBeCloseTo(20, 4); // 4,000/20,000 -> +8.00 points, not +40%

    const receivable = result.balanceSheet.find((r) => r.label === "Receivable")!;
    expect(receivable.current).toBeCloseTo(5_000, 2);
    expect(receivable.prior).toBeCloseTo(3_000, 2);

    for (const label of ["Permanence", "Financial balance", "Long-term working capital"]) {
      const row = result.solvency.find((r) => r.label === label)!;
      expect(row.current).toBeNull();
      expect(row.prior).toBeNull();
    }
  });
});

describe("getTopInvoices", () => {
  it("sorts by amount descending, not by recency", async () => {
    mockDb.accountingInvoice.findMany.mockResolvedValueOnce([
      { id: "inv-2", invoiceNumber: "INV-0002", customerName: "Acme", status: "SENT", issueDate: new Date(2026, 0, 10), amount: "41750.00", amountPaid: "0.00", amountCredited: "0.00", createdBy: null },
      { id: "inv-1", invoiceNumber: "INV-0001", customerName: "OpenWood", status: "PAID", issueDate: new Date(2026, 0, 5), amount: "1000.00", amountPaid: "1000.00", amountCredited: "0.00", createdBy: { name: "Mitchell Admin" } },
    ]);

    const rows = await dashboard.getTopInvoices(ORG, "month", 10, NOW);

    expect(rows[0].invoiceNumber).toBe("INV-0002");
    expect(rows[0].amount).toBeCloseTo(41_750, 2);
    expect(rows[1].createdByName).toBe("Mitchell Admin");
    expect(rows[1].outstanding).toBeCloseTo(0, 2);
    const callArg = mockDb.accountingInvoice.findMany.mock.calls[0][0];
    expect(callArg.orderBy).toEqual({ amount: "desc" });
  });
});
