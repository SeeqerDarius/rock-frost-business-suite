import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Mocked-db unit tests for the petty cash workflow in
 * src/modules/accounting/service.ts, following the same pattern as
 * test/pass2-financial-inventory-integrity.test.ts's Accounting block:
 * validation that runs before any db call, and the atomic guards (row-lock
 * balance re-check, guarded status claim) that protect against concurrent
 * double-spends and double-closes.
 */

const mockDb = {
  accountingAccount: { findMany: vi.fn(), createMany: vi.fn(), count: vi.fn() },
  accountingPettyCashFund: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn(), count: vi.fn() },
  accountingPettyCashTransaction: { create: vi.fn() },
  accountingJournalEntry: { create: vi.fn() },
  accountingJournalLine: { findMany: vi.fn() },
  accountingExpenseCategory: { findFirst: vi.fn() },
  $transaction: vi.fn(),
  $queryRaw: vi.fn(),
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
  // The default Cash (1000) and General Expenses (5000) accounts "already
  // exist" so ensureDefaultAccounts/getDefaultAccount resolve them without
  // needing to model the full DEFAULT_ACCOUNTS seeding round trip.
  mockDb.accountingAccount.findMany.mockResolvedValue([
    { id: "acct-1000", code: "1000" },
    { id: "acct-5000", code: "5000" },
  ]);
  mockDb.accountingAccount.count.mockResolvedValue(2); // both journal lines' accounts are owned by ORG
});

describe("Petty cash — validation before any db call", () => {
  it("createPettyCashFund rejects a zero float amount without touching the database", async () => {
    await expect(
      accounting.createPettyCashFund(ORG, { name: "Front desk", custodianName: "Ama", floatAmount: "0" }),
    ).rejects.toThrow(accounting.InvalidPaymentError);
    expect(mockDb.accountingAccount.findMany).not.toHaveBeenCalled();
  });

  it("createPettyCashFund rejects a negative float amount", async () => {
    await expect(
      accounting.createPettyCashFund(ORG, { name: "Front desk", custodianName: "Ama", floatAmount: "-50.00" }),
    ).rejects.toThrow(accounting.InvalidPaymentError);
  });

  it("recordPettyCashExpense rejects a non-positive amount without looking up the fund", async () => {
    await expect(
      accounting.recordPettyCashExpense(ORG, "fund-1", { amount: "0", description: "Nothing" }),
    ).rejects.toThrow(accounting.InvalidPaymentError);
    expect(mockDb.accountingPettyCashFund.findFirst).not.toHaveBeenCalled();
  });
});

describe("Petty cash — row-locked balance and status re-check", () => {
  it("recordPettyCashExpense rejects an expense that exceeds the fund's locked balance", async () => {
    mockDb.accountingPettyCashFund.findFirst.mockResolvedValue({ id: "fund-1", organizationId: ORG, accountId: "acct-pc", status: "ACTIVE", floatAmount: "100.00" });
    mockDb.$queryRaw.mockResolvedValue([{ id: "fund-1", status: "ACTIVE" }]);
    mockDb.accountingJournalLine.findMany.mockResolvedValue([{ debit: "40.00", credit: "0" }]); // balance = 40.00

    await expect(
      accounting.recordPettyCashExpense(ORG, "fund-1", { amount: "50.00", description: "Fuel" }),
    ).rejects.toThrow(accounting.InvalidPaymentError);
    expect(mockDb.accountingJournalEntry.create).not.toHaveBeenCalled();
  });

  it("recordPettyCashExpense rejects against a fund that was closed between the initial read and the lock", async () => {
    mockDb.accountingPettyCashFund.findFirst.mockResolvedValue({ id: "fund-1", organizationId: ORG, accountId: "acct-pc", status: "ACTIVE", floatAmount: "100.00" });
    mockDb.$queryRaw.mockResolvedValue([{ id: "fund-1", status: "CLOSED" }]); // closed by a concurrent request

    await expect(
      accounting.recordPettyCashExpense(ORG, "fund-1", { amount: "10.00", description: "Fuel" }),
    ).rejects.toThrow(accounting.PettyCashStateError);
  });

  it("recordPettyCashExpense posts a balanced Debit Expense / Credit fund-account entry when the amount fits", async () => {
    mockDb.accountingPettyCashFund.findFirst.mockResolvedValue({ id: "fund-1", organizationId: ORG, accountId: "acct-pc", status: "ACTIVE", floatAmount: "100.00" });
    mockDb.$queryRaw.mockResolvedValue([{ id: "fund-1", status: "ACTIVE" }]);
    mockDb.accountingJournalLine.findMany.mockResolvedValue([{ debit: "100.00", credit: "0" }]); // full float available
    mockDb.accountingJournalEntry.create.mockResolvedValue({ id: "entry-1" });
    mockDb.accountingPettyCashTransaction.create.mockResolvedValue({ id: "txn-1" });

    await accounting.recordPettyCashExpense(ORG, "fund-1", { amount: "35.00", description: "Stationery" });

    expect(mockDb.accountingJournalEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lines: expect.objectContaining({
            create: [
              { accountId: "acct-5000", debit: "35.00", credit: 0 },
              { accountId: "acct-pc", debit: 0, credit: "35.00" },
            ],
          }),
        }),
      }),
    );
  });
});

describe("Petty cash — replenishment shortfall calculation", () => {
  it("replenishPettyCashFund tops the fund back up to its float when no amount is given", async () => {
    mockDb.accountingPettyCashFund.findFirst.mockResolvedValue({ id: "fund-1", organizationId: ORG, accountId: "acct-pc", name: "Front desk", status: "ACTIVE", floatAmount: "100.00" });
    mockDb.$queryRaw.mockResolvedValue([{ id: "fund-1", status: "ACTIVE" }]);
    mockDb.accountingJournalLine.findMany.mockResolvedValue([{ debit: "40.00", credit: "0" }]); // balance = 40.00, shortfall = 60.00
    mockDb.accountingJournalEntry.create.mockResolvedValue({ id: "entry-1" });
    mockDb.accountingPettyCashTransaction.create.mockResolvedValue({ id: "txn-1" });

    await accounting.replenishPettyCashFund(ORG, "fund-1", {}, null);

    expect(mockDb.accountingJournalEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lines: expect.objectContaining({
            create: [
              { accountId: "acct-pc", debit: "60.00", credit: 0 },
              { accountId: "acct-1000", debit: 0, credit: "60.00" },
            ],
          }),
        }),
      }),
    );
  });

  it("replenishPettyCashFund rejects when the fund already sits at (or above) its float and no amount is given", async () => {
    mockDb.accountingPettyCashFund.findFirst.mockResolvedValue({ id: "fund-1", organizationId: ORG, accountId: "acct-pc", name: "Front desk", status: "ACTIVE", floatAmount: "100.00" });
    mockDb.$queryRaw.mockResolvedValue([{ id: "fund-1", status: "ACTIVE" }]);
    mockDb.accountingJournalLine.findMany.mockResolvedValue([{ debit: "100.00", credit: "0" }]); // no shortfall

    await expect(accounting.replenishPettyCashFund(ORG, "fund-1", {}, null)).rejects.toThrow(accounting.InvalidPaymentError);
  });
});

describe("Petty cash — atomic close claim", () => {
  it("closePettyCashFund throws PettyCashStateError when the ACTIVE->CLOSED claim matches zero rows (already closed)", async () => {
    mockDb.accountingPettyCashFund.findFirst.mockResolvedValue({ id: "fund-1", organizationId: ORG, accountId: "acct-pc", name: "Front desk", status: "CLOSED", floatAmount: "100.00" });
    mockDb.accountingPettyCashFund.updateMany.mockResolvedValue({ count: 0 }); // another close already claimed it

    await expect(accounting.closePettyCashFund(ORG, "fund-1", null)).rejects.toThrow(accounting.PettyCashStateError);
    expect(mockDb.accountingJournalEntry.create).not.toHaveBeenCalled();
  });
});
