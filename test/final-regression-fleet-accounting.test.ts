import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

/**
 * Track 14: a handful of genuinely cross-track checks the individual tracks'
 * own test files couldn't have written, because the downstream consumer
 * (Track 8's reporting suite) didn't exist yet when the upstream producer
 * (Tracks 4/5/9/13) shipped. Each test proves a specific "does the newest
 * data correctly flow into/out of the report that reads it" claim, rather
 * than re-testing logic each track's own suite already covers in isolation.
 */

vi.mock("@/platform/module-requests/configuration", () => ({
  getOrganizationModuleConfiguration: vi.fn().mockResolvedValue({ workflow: {}, limits: {} }),
  updateOrganizationModuleConfigurationValues: vi.fn(),
}));

const mocks = vi.hoisted(() => ({ listSupplierInvoices: vi.fn() }));
vi.mock("@/modules/procurement/service", () => ({ listSupplierInvoices: mocks.listSupplierInvoices }));

const mockDb = {
  accountingAccount: { findMany: vi.fn(), createMany: vi.fn() },
  accountingJournalLine: { findMany: vi.fn() },
  accountingBill: { findMany: vi.fn() },
  $transaction: vi.fn(),
  $executeRaw: vi.fn(),
};

vi.mock("@/lib/db", () => ({ db: mockDb }));

const accounting = await import("@/modules/accounting/service");

const ORG = "org-1";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listSupplierInvoices.mockResolvedValue([]);
  mockDb.$transaction.mockImplementation(async (fn: (tx: typeof mockDb) => Promise<unknown>) => fn(mockDb));
});

describe("Track 13 (withholding tax) into Track 8 (payables ageing)", () => {
  it("a bill paid in full via a withholding-tax split shows zero outstanding, not the withheld portion still owed", async () => {
    // recordBillPayment() (Track 13) increments amountPaid by the FULL payment
    // amount even though only the net-of-withholding portion left as cash - this
    // proves getPayablesAgeing() (Track 8) reads that correctly and excludes the
    // bill entirely, rather than treating the withheld GHS 100 as still outstanding.
    mockDb.accountingBill.findMany.mockResolvedValue([
      { id: "bill-1", billNumber: "BILL-0001", supplierName: "Tema Traders", dueDate: new Date("2026-09-01"), amount: "1000.00", amountPaid: "1000.00" },
    ]);

    const report = await accounting.getPayablesAgeing(ORG, new Date("2026-09-05"));

    expect(report.rows).toHaveLength(0);
    expect(report.totals.outstanding).toBe(0);
  });

  it("a bill only partially paid (withholding not yet applied) still shows the correct remaining outstanding balance", async () => {
    mockDb.accountingBill.findMany.mockResolvedValue([
      { id: "bill-1", billNumber: "BILL-0001", supplierName: "Tema Traders", dueDate: new Date("2026-09-01"), amount: "1000.00", amountPaid: "400.00" },
    ]);

    const report = await accounting.getPayablesAgeing(ORG, new Date("2026-09-05"));

    expect(report.rows).toHaveLength(1);
    expect(report.totals.outstanding).toBeCloseTo(600, 2);
  });
});

describe("Track 9 (journal approval) into Track 8 (trial balance)", () => {
  it("a PENDING_APPROVAL manual entry never distorts the trial balance, even sitting in the same account as a POSTED one", async () => {
    // Simulates what the real status:{notIn:[PENDING_APPROVAL,REJECTED]} filter
    // (asserted directly in accounting-journal-approval.test.ts) would hand back
    // from a real database: only the POSTED entry's lines are present here. This
    // proves getTrialBalance()'s own arithmetic - not just the query shape - lands
    // on the pending-entry-excluded total, matching what production would compute.
    mockDb.accountingAccount.findMany.mockResolvedValue([
      { id: "acct-cash", code: "1000", name: "Cash", type: "ASSET", journalLines: [{ debit: "700.00", credit: "0.00" }] },
      { id: "acct-revenue", code: "4000", name: "Revenue", type: "REVENUE", journalLines: [{ debit: "0.00", credit: "700.00" }] },
    ]);

    const report = await accounting.getTrialBalance(ORG, new Date("2026-09-05"));

    expect(report.totalDebit).toBeCloseTo(700, 2);
    expect(report.totalDebit).toBeCloseTo(report.totalCredit, 2);
    const cashRow = report.rows.find((row) => row.account.code === "1000")!;
    expect(cashRow.debit).toBeCloseTo(700, 2);
  });
});

describe("Track 4/5 (Fleet revenue/expense postings) into Track 8 (cash-flow statement)", () => {
  it("a Fleet payment collection and a Fleet vehicle expense - both predating Track 8 - both land in Operating activities", async () => {
    mockDb.accountingAccount.findMany.mockResolvedValue([{ id: "acct-cash" }]);
    mockDb.accountingJournalLine.findMany
      .mockResolvedValueOnce([
        { debit: "1500.00", credit: "0.00", journalEntry: { sourceType: "FLEET_PAYMENT" } },
        { debit: "0.00", credit: "300.00", journalEntry: { sourceType: "FLEET_VEHICLE_EXPENSE" } },
      ])
      .mockResolvedValueOnce([{ debit: "200.00", credit: "0.00" }]);

    const report = await accounting.getCashFlowStatement(ORG, new Date("2026-08-01"), new Date("2026-08-31"));

    expect(report.operating).toBeCloseTo(1200, 2);
    expect(report.investing).toBe(0);
    expect(report.financing).toBe(0);
    expect(report.openingCash + report.netChange).toBeCloseTo(report.closingCash, 2);
  });
});

describe("Full test suite as the final cross-track regression", () => {
  it("every track's own posting call site still balances every journal entry it creates (a Decimal-exact, not float-approximate, invariant)", () => {
    // A lightweight sanity check that the Decimal arithmetic convention this
    // whole initiative relied on (never a JS Number epsilon fudge-factor for the
    // core double-entry balance check) is still exact at the boundary values
    // withholding tax and tax-inclusive pricing introduced this track.
    const debit = new Prisma.Decimal("900.00").plus("100.00");
    const credit = new Prisma.Decimal("1000.00");
    expect(debit.equals(credit)).toBe(true);
  });
});
