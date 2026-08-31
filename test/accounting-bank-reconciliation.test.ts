import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

function p2002(message: string) {
  return new Prisma.PrismaClientKnownRequestError(message, { code: "P2002", clientVersion: "6.19.3" });
}

const mockDb = {
  accountingAccount: { findMany: vi.fn(), createMany: vi.fn() },
  accountingReconciliation: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn() },
  accountingBankStatementLine: { findMany: vi.fn(), createMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  accountingJournalLine: { findMany: vi.fn(), findFirst: vi.fn() },
  $transaction: vi.fn(),
  $executeRaw: vi.fn(),
};

vi.mock("@/lib/db", () => ({ db: mockDb }));

const accounting = await import("@/modules/accounting/service");

const ORG = "org-1";
const RECONCILIATION_ID = "recon-1";
const LIQUIDITY_ACCOUNT = { id: "acct-cash", code: "1000", name: "Cash", type: "ASSET", liquidityType: "CASH", journalLines: [] };

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.$transaction.mockImplementation(async (callback: (tx: typeof mockDb) => Promise<unknown>) => callback(mockDb));
  // listAccounts() -> ensureDefaultAccounts() (2 calls) then its own read (1 call).
  mockDb.accountingAccount.findMany.mockResolvedValue([LIQUIDITY_ACCOUNT]);
});

describe("createDraftReconciliation", () => {
  it("creates a new DRAFT reconciliation when none exists for this account and period", async () => {
    mockDb.accountingReconciliation.findFirst.mockResolvedValue(null);
    mockDb.accountingReconciliation.create.mockResolvedValue({ id: RECONCILIATION_ID, status: "DRAFT" });

    const result = await accounting.createDraftReconciliation(ORG, { accountId: "acct-cash", periodStart: new Date("2026-08-01"), periodEnd: new Date("2026-08-31") }, "user-1");

    expect(mockDb.accountingReconciliation.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "DRAFT", accountId: "acct-cash" }),
    }));
    expect(result.id).toBe(RECONCILIATION_ID);
  });

  it("returns the existing draft instead of creating a second one for the same period", async () => {
    const existing = { id: RECONCILIATION_ID, status: "DRAFT" };
    mockDb.accountingReconciliation.findFirst.mockResolvedValue(existing);

    const result = await accounting.createDraftReconciliation(ORG, { accountId: "acct-cash", periodStart: new Date("2026-08-01"), periodEnd: new Date("2026-08-31") });

    expect(result).toBe(existing);
    expect(mockDb.accountingReconciliation.create).not.toHaveBeenCalled();
  });

  it("converts a unique-constraint collision with a completed reconciliation into a clear error", async () => {
    mockDb.accountingReconciliation.findFirst.mockResolvedValue(null);
    mockDb.accountingReconciliation.create.mockRejectedValue(p2002("Unique constraint failed"));

    await expect(
      accounting.createDraftReconciliation(ORG, { accountId: "acct-cash", periodStart: new Date("2026-08-01"), periodEnd: new Date("2026-08-31") }),
    ).rejects.toBeInstanceOf(accounting.ReconciliationStateError);
  });

  it("rejects an account that is not a cash or bank liquidity account", async () => {
    mockDb.accountingAccount.findMany.mockResolvedValue([{ ...LIQUIDITY_ACCOUNT, id: "acct-revenue", liquidityType: "NONE" }]);

    await expect(
      accounting.createDraftReconciliation(ORG, { accountId: "acct-revenue", periodStart: new Date(), periodEnd: new Date() }),
    ).rejects.toBeInstanceOf(accounting.NotFoundError);
  });
});

describe("importBankStatementLines", () => {
  const rows = [
    { date: new Date("2026-08-05"), description: "POS settlement", amount: "500.00" },
    { date: new Date("2026-08-06"), description: "Rent withdrawal", amount: "-1200.00" },
  ];

  it("rejects importing into a reconciliation that is not DRAFT", async () => {
    mockDb.accountingReconciliation.findFirst.mockResolvedValue({ id: RECONCILIATION_ID, organizationId: ORG, status: "COMPLETED" });

    await expect(accounting.importBankStatementLines(ORG, RECONCILIATION_ID, rows)).rejects.toBeInstanceOf(accounting.ReconciliationStateError);
    expect(mockDb.accountingBankStatementLine.createMany).not.toHaveBeenCalled();
  });

  it("rejects importing into a reconciliation that does not exist in this organization", async () => {
    mockDb.accountingReconciliation.findFirst.mockResolvedValue(null);

    await expect(accounting.importBankStatementLines(ORG, RECONCILIATION_ID, rows)).rejects.toBeInstanceOf(accounting.NotFoundError);
  });

  it("inserts one row per line, keyed by its position in the file", async () => {
    mockDb.accountingReconciliation.findFirst.mockResolvedValue({ id: RECONCILIATION_ID, organizationId: ORG, status: "DRAFT" });
    mockDb.accountingBankStatementLine.createMany.mockResolvedValue({ count: 2 });

    const result = await accounting.importBankStatementLines(ORG, RECONCILIATION_ID, rows);

    expect(mockDb.accountingBankStatementLine.createMany).toHaveBeenCalledWith({
      data: [
        { organizationId: ORG, reconciliationId: RECONCILIATION_ID, sequenceInFile: 0, date: rows[0].date, description: rows[0].description, amount: rows[0].amount },
        { organizationId: ORG, reconciliationId: RECONCILIATION_ID, sequenceInFile: 1, date: rows[1].date, description: rows[1].description, amount: rows[1].amount },
      ],
      skipDuplicates: true,
    });
    expect(result).toEqual({ importedCount: 2, skippedCount: 0 });
  });

  it("re-importing the exact same file is a no-op: skipDuplicates catches every row", async () => {
    mockDb.accountingReconciliation.findFirst.mockResolvedValue({ id: RECONCILIATION_ID, organizationId: ORG, status: "DRAFT" });
    mockDb.accountingBankStatementLine.createMany.mockResolvedValue({ count: 0 });

    const result = await accounting.importBankStatementLines(ORG, RECONCILIATION_ID, rows);

    expect(result).toEqual({ importedCount: 0, skippedCount: 2 });
  });
});

describe("suggestReconciliationMatches", () => {
  const reconciliation = { id: RECONCILIATION_ID, organizationId: ORG, accountId: "acct-cash", periodStart: new Date("2026-08-01"), periodEnd: new Date("2026-08-31") };

  it("matches an unmatched statement line to a journal line with the exact same signed amount and a nearby date", async () => {
    mockDb.accountingReconciliation.findFirst.mockResolvedValue(reconciliation);
    mockDb.accountingBankStatementLine.findMany.mockResolvedValue([
      { id: "line-1", amount: new Prisma.Decimal("500.00"), date: new Date("2026-08-05") },
    ]);
    mockDb.accountingJournalLine.findMany.mockResolvedValue([
      { id: "jl-1", debit: new Prisma.Decimal("500.00"), credit: new Prisma.Decimal("0.00"), journalEntry: { description: "Cash sale", entryDate: new Date("2026-08-05"), postingNumber: "JRN-00000001" } },
    ]);

    const suggestions = await accounting.suggestReconciliationMatches(ORG, RECONCILIATION_ID);

    expect(suggestions).toEqual([{ statementLineId: "line-1", journalLineId: "jl-1", journalEntryDescription: "Cash sale", journalEntryDate: new Date("2026-08-05"), postingNumber: "JRN-00000001" }]);
  });

  it("falls back to a small tolerance match only when no exact match exists", async () => {
    mockDb.accountingReconciliation.findFirst.mockResolvedValue(reconciliation);
    mockDb.accountingBankStatementLine.findMany.mockResolvedValue([
      { id: "line-1", amount: new Prisma.Decimal("500.00"), date: new Date("2026-08-05") },
    ]);
    mockDb.accountingJournalLine.findMany.mockResolvedValue([
      { id: "jl-1", debit: new Prisma.Decimal("500.01"), credit: new Prisma.Decimal("0.00"), journalEntry: { description: "Cash sale, fee-adjusted", entryDate: new Date("2026-08-05"), postingNumber: "JRN-00000001" } },
    ]);

    const suggestions = await accounting.suggestReconciliationMatches(ORG, RECONCILIATION_ID);

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].journalLineId).toBe("jl-1");
  });

  it("never suggests the same journal line twice for two different statement lines", async () => {
    mockDb.accountingReconciliation.findFirst.mockResolvedValue(reconciliation);
    mockDb.accountingBankStatementLine.findMany.mockResolvedValue([
      { id: "line-1", amount: new Prisma.Decimal("500.00"), date: new Date("2026-08-05") },
      { id: "line-2", amount: new Prisma.Decimal("500.00"), date: new Date("2026-08-06") },
    ]);
    mockDb.accountingJournalLine.findMany.mockResolvedValue([
      { id: "jl-1", debit: new Prisma.Decimal("500.00"), credit: new Prisma.Decimal("0.00"), journalEntry: { description: "Cash sale", entryDate: new Date("2026-08-05"), postingNumber: "JRN-00000001" } },
    ]);

    const suggestions = await accounting.suggestReconciliationMatches(ORG, RECONCILIATION_ID);

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].statementLineId).toBe("line-1");
  });

  it("suggests nothing for a statement line with no matching journal line", async () => {
    mockDb.accountingReconciliation.findFirst.mockResolvedValue(reconciliation);
    mockDb.accountingBankStatementLine.findMany.mockResolvedValue([{ id: "line-1", amount: new Prisma.Decimal("77.00"), date: new Date("2026-08-05") }]);
    mockDb.accountingJournalLine.findMany.mockResolvedValue([]);

    const suggestions = await accounting.suggestReconciliationMatches(ORG, RECONCILIATION_ID);

    expect(suggestions).toEqual([]);
  });
});

describe("confirmReconciliationMatch", () => {
  it("marks the statement line MATCHED against the chosen journal line", async () => {
    mockDb.accountingReconciliation.findFirst.mockResolvedValue({ id: RECONCILIATION_ID, organizationId: ORG, accountId: "acct-cash", status: "DRAFT" });
    mockDb.accountingBankStatementLine.findFirst.mockResolvedValue({ id: "line-1", status: "UNMATCHED" });
    mockDb.accountingJournalLine.findFirst.mockResolvedValue({ id: "jl-1" });
    mockDb.accountingBankStatementLine.update.mockResolvedValue({ id: "line-1", status: "MATCHED" });

    await accounting.confirmReconciliationMatch(ORG, RECONCILIATION_ID, "line-1", "jl-1");

    expect(mockDb.accountingBankStatementLine.update).toHaveBeenCalledWith({ where: { id: "line-1" }, data: { status: "MATCHED", matchedJournalLineId: "jl-1" } });
  });

  it("rejects confirming a statement line that has already been decided", async () => {
    mockDb.accountingReconciliation.findFirst.mockResolvedValue({ id: RECONCILIATION_ID, organizationId: ORG, accountId: "acct-cash", status: "DRAFT" });
    mockDb.accountingBankStatementLine.findFirst.mockResolvedValue({ id: "line-1", status: "MATCHED" });
    mockDb.accountingJournalLine.findFirst.mockResolvedValue({ id: "jl-1" });

    await expect(accounting.confirmReconciliationMatch(ORG, RECONCILIATION_ID, "line-1", "jl-1")).rejects.toBeInstanceOf(accounting.ReconciliationStateError);
    expect(mockDb.accountingBankStatementLine.update).not.toHaveBeenCalled();
  });

  it("converts a concurrent double-match (P2002 on the unique matchedJournalLineId) into a clear error", async () => {
    mockDb.accountingReconciliation.findFirst.mockResolvedValue({ id: RECONCILIATION_ID, organizationId: ORG, accountId: "acct-cash", status: "DRAFT" });
    mockDb.accountingBankStatementLine.findFirst.mockResolvedValue({ id: "line-1", status: "UNMATCHED" });
    mockDb.accountingJournalLine.findFirst.mockResolvedValue({ id: "jl-1" });
    mockDb.accountingBankStatementLine.update.mockRejectedValue(p2002("Unique constraint failed"));

    await expect(accounting.confirmReconciliationMatch(ORG, RECONCILIATION_ID, "line-1", "jl-1")).rejects.toBeInstanceOf(accounting.ReconciliationStateError);
  });
});

describe("ignoreReconciliationLine", () => {
  it("marks an unmatched line IGNORED", async () => {
    mockDb.accountingReconciliation.findFirst.mockResolvedValue({ id: RECONCILIATION_ID, organizationId: ORG, status: "DRAFT" });
    mockDb.accountingBankStatementLine.updateMany.mockResolvedValue({ count: 1 });

    await accounting.ignoreReconciliationLine(ORG, RECONCILIATION_ID, "line-1");

    expect(mockDb.accountingBankStatementLine.updateMany).toHaveBeenCalledWith({
      where: { id: "line-1", organizationId: ORG, reconciliationId: RECONCILIATION_ID, status: "UNMATCHED" },
      data: { status: "IGNORED" },
    });
  });

  it("rejects ignoring a line that has already been decided", async () => {
    mockDb.accountingReconciliation.findFirst.mockResolvedValue({ id: RECONCILIATION_ID, organizationId: ORG, status: "DRAFT" });
    mockDb.accountingBankStatementLine.updateMany.mockResolvedValue({ count: 0 });

    await expect(accounting.ignoreReconciliationLine(ORG, RECONCILIATION_ID, "line-1")).rejects.toBeInstanceOf(accounting.ReconciliationStateError);
  });
});

describe("completeDraftReconciliation", () => {
  it("computes the ledger balance and difference exactly like the instant completeReconciliation path", async () => {
    mockDb.accountingReconciliation.findFirst.mockResolvedValue({ id: RECONCILIATION_ID, organizationId: ORG, accountId: "acct-cash", status: "DRAFT" });
    mockDb.accountingReconciliation.updateMany.mockResolvedValue({ count: 1 });
    mockDb.accountingReconciliation.findUniqueOrThrow.mockResolvedValue({ id: RECONCILIATION_ID, status: "COMPLETED" });
    mockDb.accountingAccount.findMany.mockResolvedValue([{ ...LIQUIDITY_ACCOUNT, journalLines: [{ debit: "700.00", credit: "0.00" }] }]);

    await accounting.completeDraftReconciliation(ORG, RECONCILIATION_ID, { statementBalance: "750.00" }, "user-1");

    expect(mockDb.accountingReconciliation.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: RECONCILIATION_ID, organizationId: ORG, status: "DRAFT" },
      data: expect.objectContaining({ status: "COMPLETED" }),
    }));
    const call = mockDb.accountingReconciliation.updateMany.mock.calls[0][0];
    expect(call.data.ledgerBalance.toNumber()).toBeCloseTo(700, 2);
    expect(call.data.difference.toNumber()).toBeCloseTo(50, 2);
  });

  it("still completes - leaving a non-zero difference - when a statement line was never matched to the ledger", async () => {
    mockDb.accountingReconciliation.findFirst.mockResolvedValue({ id: RECONCILIATION_ID, organizationId: ORG, accountId: "acct-cash", status: "DRAFT" });
    mockDb.accountingReconciliation.updateMany.mockResolvedValue({ count: 1 });
    mockDb.accountingReconciliation.findUniqueOrThrow.mockResolvedValue({ id: RECONCILIATION_ID, status: "COMPLETED" });
    // The ledger never received the unmatched statement line's transaction, so its balance
    // stays at 700 even though the bank statement says 1200 - the difference must reflect that.
    mockDb.accountingAccount.findMany.mockResolvedValue([{ ...LIQUIDITY_ACCOUNT, journalLines: [{ debit: "700.00", credit: "0.00" }] }]);

    await accounting.completeDraftReconciliation(ORG, RECONCILIATION_ID, { statementBalance: "1200.00" }, "user-1");

    const call = mockDb.accountingReconciliation.updateMany.mock.calls[0][0];
    expect(call.data.difference.isZero()).toBe(false);
    expect(call.data.difference.toNumber()).toBeCloseTo(500, 2);
  });

  it("rejects completing a reconciliation that is no longer a draft", async () => {
    mockDb.accountingReconciliation.findFirst.mockResolvedValue({ id: RECONCILIATION_ID, organizationId: ORG, accountId: "acct-cash", status: "COMPLETED" });

    await expect(accounting.completeDraftReconciliation(ORG, RECONCILIATION_ID, { statementBalance: "100.00" })).rejects.toBeInstanceOf(accounting.ReconciliationStateError);
  });
});
