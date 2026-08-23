import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Mocked-db unit test for getStatementOfFinancialPosition in
 * src/modules/accounting/service.ts — proves the accounting identity
 * (Assets = Liabilities + Equity, with the current period's unposted net
 * income folded into equity as retained earnings) holds for a set of
 * account balances built the same way listAccounts() computes them.
 */

const mockDb = {
  accountingAccount: { findMany: vi.fn(), createMany: vi.fn() },
  $transaction: vi.fn(),
  $executeRaw: vi.fn(),
};

vi.mock("@/lib/db", () => ({ db: mockDb }));

const accounting = await import("@/modules/accounting/service");

const ORG = "org-1";

const FULL_ACCOUNTS = [
  { id: "a1", code: "1000", name: "Cash", type: "ASSET", journalLines: [{ debit: "500.00", credit: "0" }] },
  { id: "a2", code: "1100", name: "Accounts Receivable", type: "ASSET", journalLines: [] },
  { id: "l1", code: "2000", name: "Accounts Payable", type: "LIABILITY", journalLines: [{ debit: "0", credit: "200.00" }] },
  { id: "e1", code: "3000", name: "Owner Equity", type: "EQUITY", journalLines: [{ debit: "0", credit: "100.00" }] },
  { id: "r1", code: "4000", name: "Revenue", type: "REVENUE", journalLines: [{ debit: "0", credit: "300.00" }] },
  { id: "x1", code: "5000", name: "General Expenses", type: "EXPENSE", journalLines: [{ debit: "100.00", credit: "0" }] },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.$transaction.mockImplementation(async (fn: (tx: typeof mockDb) => Promise<unknown>) => fn(mockDb));
  // ensureDefaultAccounts' isSystem-scoped findMany call (no include) sees
  // every default code already present, so it never calls createMany;
  // listAccounts' own findMany call (with the journalLines include) is
  // told apart by that include and returns the full ledger above.
  mockDb.accountingAccount.findMany.mockImplementation((args: { include?: { journalLines?: boolean } }) => {
    if (args?.include?.journalLines) return Promise.resolve(FULL_ACCOUNTS);
    return Promise.resolve(FULL_ACCOUNTS.map((a) => ({ code: a.code })));
  });
});

describe("Statement of financial position", () => {
  it("balances: Assets = Liabilities + Equity, with current-period net income folded into equity", async () => {
    const position = await accounting.getStatementOfFinancialPosition(ORG);

    expect(position.totalAssets).toBeCloseTo(500);
    expect(position.totalLiabilities).toBeCloseTo(200);
    expect(position.statedEquity).toBeCloseTo(100);
    expect(position.netIncome).toBeCloseTo(200); // 300 revenue - 100 expense
    expect(position.totalEquity).toBeCloseTo(300); // statedEquity + netIncome
    expect(position.isBalanced).toBe(true);
    expect(position.difference).toBeCloseTo(0);
  });

  it("flags an unbalanced ledger rather than silently reporting a wrong total", async () => {
    mockDb.accountingAccount.findMany.mockImplementation((args: { include?: { journalLines?: boolean } }) => {
      if (args?.include?.journalLines) {
        // Liability posted with no offsetting entry anywhere - a ledger
        // corruption bug this report should surface, not mask.
        return Promise.resolve([
          { id: "a1", code: "1000", name: "Cash", type: "ASSET", journalLines: [{ debit: "500.00", credit: "0" }] },
          { id: "l1", code: "2000", name: "Accounts Payable", type: "LIABILITY", journalLines: [{ debit: "0", credit: "999.00" }] },
        ]);
      }
      return Promise.resolve([]);
    });

    const position = await accounting.getStatementOfFinancialPosition(ORG);
    expect(position.isBalanced).toBe(false);
    expect(position.difference).not.toBeCloseTo(0);
  });
});
