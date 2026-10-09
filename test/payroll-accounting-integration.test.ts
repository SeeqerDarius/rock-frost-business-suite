import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  organizationModuleFindFirst: vi.fn(),
  subscriptionFindMany: vi.fn(),
  ensureDefaultAccounts: vi.fn(),
  postSourceJournalEntry: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: { organizationModule: { findFirst: mocks.organizationModuleFindFirst }, subscription: { findMany: mocks.subscriptionFindMany } } }));
vi.mock("@/modules/accounting/service", () => ({
  ensureDefaultAccounts: mocks.ensureDefaultAccounts,
  listAccounts: vi.fn(),
  postProcurementTaxAccrual: vi.fn(),
  postSourceJournalEntry: mocks.postSourceJournalEntry,
  reverseSourceJournalEntry: vi.fn(),
}));

const { postPayrollRunAccrual } = await import("@/lib/accounting-integration");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.organizationModuleFindFirst.mockResolvedValue({ id: "accounting-module" });
  mocks.subscriptionFindMany.mockResolvedValue([]);
  mocks.ensureDefaultAccounts.mockResolvedValue([
    { id: "salary-expense", code: "5190", type: "EXPENSE" },
    { id: "salary-payable", code: "2230", type: "LIABILITY" },
    { id: "deduction-payable", code: "2220", type: "LIABILITY" },
  ]);
  mocks.postSourceJournalEntry.mockResolvedValue({ id: "journal-1" });
});

describe("postPayrollRunAccrual", () => {
  it("posts a balanced gross-salary, net-pay, and deduction accrual", async () => {
    await expect(postPayrollRunAccrual("org-1", {
      runId: "run-1",
      payDate: new Date("2026-10-01"),
      grossPay: "1500.00",
      netPay: "1200.00",
      deductions: "300.00",
      description: "Payroll accrual",
      actorId: "user-1",
    })).resolves.toEqual({ posted: true, journalEntryId: "journal-1" });
    expect(mocks.postSourceJournalEntry).toHaveBeenCalledWith("org-1", expect.objectContaining({
      sourceModule: "payroll",
      sourceType: "PAYROLL_RUN",
      sourceId: "run-1",
      postingPurpose: "COMPLETED_ACCRUAL",
      lines: [
        { accountId: "salary-expense", debit: "1500.00" },
        { accountId: "salary-payable", credit: "1200.00" },
        { accountId: "deduction-payable", credit: "300.00" },
      ],
    }));
  });

  it("does not create a journal when Accounting is inactive", async () => {
    mocks.organizationModuleFindFirst.mockResolvedValue(null);
    await expect(postPayrollRunAccrual("org-1", { runId: "run-1", payDate: new Date(), grossPay: "100", netPay: "100", deductions: "0", description: "Payroll accrual" })).resolves.toEqual({ posted: false, reason: "accounting-not-enabled" });
    expect(mocks.postSourceJournalEntry).not.toHaveBeenCalled();
  });

  it("rejects inconsistent payroll totals without posting an unbalanced entry", async () => {
    await expect(postPayrollRunAccrual("org-1", { runId: "run-1", payDate: new Date(), grossPay: "100", netPay: "90", deductions: "5", description: "Payroll accrual" })).resolves.toEqual({ posted: false, reason: "error" });
    expect(mocks.postSourceJournalEntry).not.toHaveBeenCalled();
  });
});
