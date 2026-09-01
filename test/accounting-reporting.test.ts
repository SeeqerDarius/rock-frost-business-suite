import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({ listSupplierInvoices: vi.fn() }));
vi.mock("@/modules/procurement/service", () => ({ listSupplierInvoices: mocks.listSupplierInvoices }));

const mockDb = {
  accountingAccount: { findMany: vi.fn(), findFirst: vi.fn(), createMany: vi.fn() },
  accountingJournalLine: { findMany: vi.fn() },
  accountingInvoice: { findMany: vi.fn() },
  accountingBill: { findMany: vi.fn() },
  $transaction: vi.fn(),
  $executeRaw: vi.fn(),
};

vi.mock("@/lib/db", () => ({ db: mockDb }));

function txPassthrough() {
  mockDb.$transaction.mockImplementation(async (fn: (tx: typeof mockDb) => Promise<unknown>) => fn(mockDb));
}

const accounting = await import("@/modules/accounting/service");

const ORG = "org-1";

beforeEach(() => {
  vi.clearAllMocks();
  txPassthrough();
  mocks.listSupplierInvoices.mockResolvedValue([]);
});

describe("getTrialBalance", () => {
  it("balances to zero: total debit column always equals total credit column", async () => {
    // A worked fixture: Cash debited 1000 / Revenue credited 1000 (a sale), then
    // Expense debited 300 / Cash credited 300 (a payment) - net Cash = +700 (debit),
    // net Revenue = -1000 raw (shown as credit 1000), net Expense = +300 (debit).
    mockDb.accountingAccount.findMany.mockResolvedValue([
      { id: "acct-cash", code: "1000", name: "Cash", type: "ASSET", journalLines: [{ debit: "1000.00", credit: "0.00" }, { debit: "0.00", credit: "300.00" }] },
      { id: "acct-revenue", code: "4000", name: "Revenue", type: "REVENUE", journalLines: [{ debit: "0.00", credit: "1000.00" }] },
      { id: "acct-expense", code: "5000", name: "Expense", type: "EXPENSE", journalLines: [{ debit: "300.00", credit: "0.00" }] },
      { id: "acct-unused", code: "2000", name: "Accounts Payable", type: "LIABILITY", journalLines: [] },
    ]);

    const report = await accounting.getTrialBalance(ORG, new Date("2026-08-31"));

    expect(report.rows).toHaveLength(3); // the zero-balance account is omitted
    expect(report.totalDebit).toBeCloseTo(report.totalCredit, 2);
    // Cash: 700 debit. Expense: 300 debit. Total debit column = 1000, matching Revenue's 1000 credit column.
    expect(report.totalDebit).toBeCloseTo(1000, 2);
    const cashRow = report.rows.find((row) => row.account.code === "1000")!;
    expect(cashRow.debit).toBeCloseTo(700, 2);
    expect(cashRow.credit).toBe(0);
    const revenueRow = report.rows.find((row) => row.account.code === "4000")!;
    expect(revenueRow.credit).toBeCloseTo(1000, 2);
    expect(revenueRow.debit).toBe(0);
  });
});

describe("getReceivablesAgeing: bucket boundaries", () => {
  const asOf = new Date("2026-08-31T00:00:00.000Z");
  const daysBefore = (days: number) => new Date(asOf.getTime() - days * 86_400_000);

  it("places an invoice exactly at each bucket boundary correctly", async () => {
    mockDb.accountingInvoice.findMany.mockResolvedValue([
      { id: "inv-current", invoiceNumber: "INV-CURRENT", customerName: "Not yet due", dueDate: daysBefore(-5), amount: "100.00", amountPaid: "0.00", amountCredited: "0.00" },
      { id: "inv-30", invoiceNumber: "INV-30", customerName: "30 days overdue", dueDate: daysBefore(30), amount: "100.00", amountPaid: "0.00", amountCredited: "0.00" },
      { id: "inv-31", invoiceNumber: "INV-31", customerName: "31 days overdue", dueDate: daysBefore(31), amount: "100.00", amountPaid: "0.00", amountCredited: "0.00" },
      { id: "inv-90", invoiceNumber: "INV-90", customerName: "90 days overdue", dueDate: daysBefore(90), amount: "100.00", amountPaid: "0.00", amountCredited: "0.00" },
      { id: "inv-91", invoiceNumber: "INV-91", customerName: "91 days overdue", dueDate: daysBefore(91), amount: "100.00", amountPaid: "0.00", amountCredited: "0.00" },
      { id: "inv-paid", invoiceNumber: "INV-PAID", customerName: "Fully paid", dueDate: daysBefore(100), amount: "100.00", amountPaid: "100.00", amountCredited: "0.00" },
    ]);

    const report = await accounting.getReceivablesAgeing(ORG, asOf);

    expect(report.rows).toHaveLength(5); // the fully-paid invoice is excluded
    const byId = Object.fromEntries(report.rows.map((row) => [row.invoiceId, row]));
    expect(byId["inv-current"].current).toBe(100);
    expect(byId["inv-30"].days30).toBe(100);
    expect(byId["inv-31"].days60).toBe(100);
    expect(byId["inv-90"].days90).toBe(100);
    expect(byId["inv-91"].over90).toBe(100);
    expect(report.totals.outstanding).toBeCloseTo(500, 2);
  });

  it("excludes an invoice's amountCredited from outstanding, not just amountPaid", async () => {
    mockDb.accountingInvoice.findMany.mockResolvedValue([
      { id: "inv-1", invoiceNumber: "INV-1", customerName: "Partly credited", dueDate: asOf, amount: "100.00", amountPaid: "20.00", amountCredited: "80.00" },
    ]);
    const report = await accounting.getReceivablesAgeing(ORG, asOf);
    expect(report.rows).toHaveLength(0);
  });
});

describe("getPayablesAgeing: reads both AccountingBill and Procurement's supplier invoices", () => {
  it("combines both sources into one ageing view", async () => {
    const asOf = new Date("2026-08-31T00:00:00.000Z");
    mockDb.accountingBill.findMany.mockResolvedValue([
      { id: "bill-1", billNumber: "BILL-0001", supplierName: "Accra Properties", dueDate: asOf, amount: "500.00", amountPaid: "0.00" },
    ]);
    mocks.listSupplierInvoices.mockResolvedValue([
      { id: "spi-1", invoiceNumber: "SPI-0001", vendor: { name: "Tema Traders" }, dueDate: asOf, invoiceDate: asOf, totalAmount: "300.00", amountPaid: "0.00", status: "APPROVED" },
      { id: "spi-2", invoiceNumber: "SPI-0002", vendor: { name: "Voided Vendor" }, dueDate: asOf, invoiceDate: asOf, totalAmount: "999.00", amountPaid: "0.00", status: "REJECTED" },
    ]);

    const report = await accounting.getPayablesAgeing(ORG, asOf);

    expect(report.rows).toHaveLength(2); // the REJECTED supplier invoice is excluded
    expect(report.rows.some((row) => row.source === "Bill" && row.reference === "BILL-0001")).toBe(true);
    expect(report.rows.some((row) => row.source === "Supplier invoice" && row.reference === "SPI-0001")).toBe(true);
    expect(report.totals.outstanding).toBeCloseTo(800, 2);
  });
});

describe("getCashFlowStatement: reconciles to the actual cash-account balance change", () => {
  it("openingCash + netChange equals closingCash, matching the true balance change over the period", async () => {
    mockDb.accountingAccount.findMany.mockResolvedValue([{ id: "acct-cash" }]);
    // Prior period: opened with a 500 debit (the account's starting balance).
    // In-period: +1000 debit (a collection), -300 credit (a payment) net +700.
    mockDb.accountingJournalLine.findMany
      .mockResolvedValueOnce([
        { debit: "1000.00", credit: "0.00", journalEntry: { sourceType: "FLEET_PAYMENT" } },
        { debit: "0.00", credit: "300.00", journalEntry: { sourceType: "ACCOUNTING_PAYABLE_PAYMENT" } },
      ])
      .mockResolvedValueOnce([{ debit: "500.00", credit: "0.00" }]);

    const report = await accounting.getCashFlowStatement(ORG, new Date("2026-08-01"), new Date("2026-08-31"));

    expect(report.openingCash).toBeCloseTo(500, 2);
    expect(report.netChange).toBeCloseTo(700, 2);
    expect(report.closingCash).toBeCloseTo(1200, 2);
    expect(report.openingCash + report.netChange).toBeCloseTo(report.closingCash, 2);
  });
});

describe("loadGhanaSmeChartOfAccounts: idempotent", () => {
  // 2130 (Withholding Tax Payable) joined SYSTEM_CODES, up from 12 to 13 codes,
  // when withholding tax became a real, always-available feature rather than an
  // optional template pick - the template's own former 2200 entry was removed
  // accordingly, so TEMPLATE_CODES drops from 21 to 20 entries.
  const SYSTEM_CODES = ["1000", "1100", "1200", "1300", "1310", "1320", "2000", "2100", "2110", "2120", "2130", "4000", "5000"];
  const TEMPLATE_CODES = ["1010", "1020", "1400", "1500", "1510", "2300", "2400", "3000", "3100", "3200", "4900", "5100", "5200", "5300", "5400", "5500", "5600", "5700", "5800", "5900"];

  it("creates nothing on a second run once every template code already exists", async () => {
    const allCodes = [...SYSTEM_CODES, ...TEMPLATE_CODES].map((code) => ({ code }));
    // ensureDefaultAccounts() itself reads accountingAccount.findMany twice
    // (its own existing-check, then its final re-read) before
    // loadGhanaSmeChartOfAccounts does its own third read.
    mockDb.accountingAccount.findMany.mockResolvedValueOnce(SYSTEM_CODES.map((code) => ({ code })));
    mockDb.accountingAccount.findMany.mockResolvedValueOnce(SYSTEM_CODES.map((code) => ({ code })));
    mockDb.accountingAccount.findMany.mockResolvedValueOnce(allCodes);

    const result = await accounting.loadGhanaSmeChartOfAccounts(ORG);

    expect(result.addedCount).toBe(0);
    expect(mockDb.accountingAccount.createMany).not.toHaveBeenCalled();
  });

  it("creates only the missing template accounts on first run", async () => {
    mockDb.accountingAccount.findMany.mockResolvedValueOnce(SYSTEM_CODES.map((code) => ({ code })));
    mockDb.accountingAccount.findMany.mockResolvedValueOnce(SYSTEM_CODES.map((code) => ({ code })));
    mockDb.accountingAccount.findMany.mockResolvedValueOnce(SYSTEM_CODES.map((code) => ({ code })));

    const result = await accounting.loadGhanaSmeChartOfAccounts(ORG);

    expect(result.addedCount).toBe(20);
    expect(mockDb.accountingAccount.createMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }));
    const created = mockDb.accountingAccount.createMany.mock.calls[0][0].data as { code: string }[];
    expect(created.some((account) => account.code === "1010")).toBe(true);
    expect(created.some((account) => account.code === "1000")).toBe(false);
  });
});
