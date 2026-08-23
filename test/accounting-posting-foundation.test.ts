import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = {
  accountingPeriod: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn(), findFirstOrThrow: vi.fn() },
  accountingAccount: { count: vi.fn() },
  accountingJournalEntry: { findFirst: vi.fn(), count: vi.fn(), create: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
  $executeRaw: vi.fn(),
  $transaction: vi.fn(),
};

vi.mock("@/lib/db", () => ({ db: mockDb }));

const accounting = await import("@/modules/accounting/service");

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.$transaction.mockImplementation(async (callback: (tx: typeof mockDb) => Promise<unknown>) => callback(mockDb));
  mockDb.accountingPeriod.findFirst.mockResolvedValue(null);
  mockDb.accountingAccount.count.mockResolvedValue(2);
  mockDb.accountingJournalEntry.count.mockResolvedValue(0);
});

const sourcePosting = {
  sourceType: "PAYROLL",
  sourceId: "run-1",
  postingPurpose: "NET_PAY",
  entryDate: new Date("2026-08-01"),
  description: "Payroll posting",
  lines: [
    { accountId: "expense", debit: "100.00" },
    { accountId: "cash", credit: "100.00" },
  ],
};

describe("Accounting posting foundation", () => {
  it("returns the existing source posting when the same idempotency identity is retried", async () => {
    const existing = { id: "journal-1", lines: [] };
    mockDb.accountingJournalEntry.findFirst.mockResolvedValue(existing);

    await expect(accounting.postSourceJournalEntry("org-1", sourcePosting)).resolves.toBe(existing);
    expect(mockDb.accountingJournalEntry.create).not.toHaveBeenCalled();
  });

  it("rejects posting into a closed accounting period", async () => {
    mockDb.accountingPeriod.findFirst.mockResolvedValue({ id: "period-1" });

    await expect(accounting.postSourceJournalEntry("org-1", sourcePosting)).rejects.toBeInstanceOf(accounting.AccountingPeriodLockedError);
    expect(mockDb.accountingJournalEntry.create).not.toHaveBeenCalled();
  });

  it("assigns an organization-scoped posting number to a new source posting", async () => {
    mockDb.accountingJournalEntry.findFirst.mockResolvedValue(null);
    mockDb.accountingJournalEntry.count.mockResolvedValue(41);
    mockDb.accountingJournalEntry.create.mockResolvedValue({ id: "journal-42" });

    await accounting.postSourceJournalEntry("org-1", sourcePosting);

    expect(mockDb.accountingJournalEntry.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ postingNumber: "JRN-00000042", postingPurpose: "NET_PAY" }),
    }));
  });

  it("creates a compensating entry and marks the original as reversed", async () => {
    mockDb.accountingJournalEntry.findFirst
      .mockResolvedValueOnce({
        id: "journal-1",
        organizationId: "org-1",
        status: "POSTED",
        sourceType: "MANUAL",
        sourceId: null,
        postingPurpose: null,
        reversalOfId: null,
        reversal: null,
        postingNumber: "JRN-00000001",
        reference: null,
        lines: [
          { accountId: "expense", debit: { toFixed: () => "100.00" }, credit: { toFixed: () => "0.00" } },
          { accountId: "cash", debit: { toFixed: () => "0.00" }, credit: { toFixed: () => "100.00" } },
        ],
      })
      .mockResolvedValueOnce(null);
    mockDb.accountingJournalEntry.create.mockResolvedValue({ id: "journal-2" });
    mockDb.accountingJournalEntry.updateMany.mockResolvedValue({ count: 1 });

    await accounting.reverseJournalEntry("org-1", "journal-1", { entryDate: new Date("2026-08-02"), reason: "Correction" });

    expect(mockDb.accountingJournalEntry.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "REVERSED" } }));
    expect(mockDb.accountingJournalEntry.update).toHaveBeenCalledWith({ where: { id: "journal-2" }, data: { reversalOfId: "journal-1" } });
  });

  it("rejects a user-facing reversal for a source-managed entry", async () => {
    mockDb.accountingJournalEntry.findFirst.mockResolvedValue({
      id: "journal-1",
      organizationId: "org-1",
      status: "POSTED",
      sourceType: "FLEET_PAYMENT",
      sourceId: "payment-1",
      postingPurpose: "COLLECTED",
      reversalOfId: null,
      reversal: null,
      lines: [],
    });

    await expect(accounting.reverseJournalEntry("org-1", "journal-1", { entryDate: new Date("2026-08-02"), reason: "Correction" }))
      .rejects.toBeInstanceOf(accounting.JournalReversalError);
    expect(mockDb.accountingJournalEntry.create).not.toHaveBeenCalled();
  });

  it("allows a source workflow to reverse only when the full posting identity matches", async () => {
    mockDb.accountingJournalEntry.findFirst
      .mockResolvedValueOnce({
        id: "journal-1",
        organizationId: "org-1",
        status: "POSTED",
        sourceType: "FLEET_PAYMENT",
        sourceId: "payment-1",
        postingPurpose: "COLLECTED",
        reversalOfId: null,
        reversal: null,
        postingNumber: "JRN-00000001",
        reference: null,
        lines: [
          { accountId: "cash", debit: { toFixed: () => "100.00" }, credit: { toFixed: () => "0.00" } },
          { accountId: "revenue", debit: { toFixed: () => "0.00" }, credit: { toFixed: () => "100.00" } },
        ],
      })
      .mockResolvedValueOnce(null);
    mockDb.accountingJournalEntry.create.mockResolvedValue({ id: "journal-2" });
    mockDb.accountingJournalEntry.updateMany.mockResolvedValue({ count: 1 });

    await accounting.reverseSourceJournalEntry("org-1", "journal-1", {
      entryDate: new Date("2026-08-02"),
      reason: "Fleet payment rejected",
      sourceType: "FLEET_PAYMENT",
      sourceId: "payment-1",
      postingPurpose: "COLLECTED",
    });

    expect(mockDb.accountingJournalEntry.create).toHaveBeenCalled();
  });
});
