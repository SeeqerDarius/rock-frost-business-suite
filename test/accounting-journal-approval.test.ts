import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = {
  accountingPeriod: { findFirst: vi.fn() },
  accountingAccount: { count: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), createMany: vi.fn() },
  branch: { count: vi.fn() },
  accountingJournalEntry: { findFirst: vi.fn(), count: vi.fn(), create: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn() },
  accountingJournalLine: { findMany: vi.fn() },
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
  mockDb.branch.count.mockResolvedValue(1);
  mockDb.accountingJournalEntry.count.mockResolvedValue(0);
  mockDb.accountingJournalEntry.findFirst.mockResolvedValue(null);
});

const manualLines = { entryDate: new Date("2026-08-01"), description: "Rent adjustment", createdById: "user-submitter", lines: [{ accountId: "expense", debit: "500.00" }, { accountId: "cash", credit: "500.00" }] };

describe("createManualJournalEntry: approval gate", () => {
  it("posts immediately when the actor holds the approve permission (regression guard on today's behavior)", async () => {
    mockDb.accountingJournalEntry.create.mockResolvedValue({ id: "journal-1", status: "POSTED" });

    await accounting.createManualJournalEntry("org-1", manualLines);

    expect(mockDb.accountingJournalEntry.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "POSTED", submittedById: null }),
    }));
  });

  it("lands PENDING_APPROVAL, not POSTED, when the actor lacks the approve permission", async () => {
    mockDb.accountingJournalEntry.create.mockResolvedValue({ id: "journal-1", status: "PENDING_APPROVAL" });

    await accounting.createManualJournalEntry("org-1", { ...manualLines, requiresApproval: true });

    expect(mockDb.accountingJournalEntry.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "PENDING_APPROVAL", submittedById: "user-submitter" }),
    }));
  });
});

describe("approveJournalEntry", () => {
  const pending = { id: "journal-1", organizationId: "org-1", status: "PENDING_APPROVAL", submittedById: "user-submitter" };

  it("flips a pending entry to POSTED and records the approver", async () => {
    mockDb.accountingJournalEntry.findFirst.mockResolvedValue(pending);
    mockDb.accountingJournalEntry.updateMany.mockResolvedValue({ count: 1 });
    mockDb.accountingJournalEntry.findUniqueOrThrow.mockResolvedValue({ ...pending, status: "POSTED" });

    await accounting.approveJournalEntry("org-1", "journal-1", "user-approver");

    expect(mockDb.accountingJournalEntry.updateMany).toHaveBeenCalledWith({
      where: { id: "journal-1", organizationId: "org-1", status: "PENDING_APPROVAL" },
      data: expect.objectContaining({ status: "POSTED", approvedById: "user-approver" }),
    });
  });

  it("rejects the submitter approving their own entry, without touching the row", async () => {
    mockDb.accountingJournalEntry.findFirst.mockResolvedValue(pending);

    await expect(accounting.approveJournalEntry("org-1", "journal-1", "user-submitter")).rejects.toBeInstanceOf(accounting.JournalApprovalError);
    expect(mockDb.accountingJournalEntry.updateMany).not.toHaveBeenCalled();
  });

  it("rejects approving an entry that is not awaiting approval", async () => {
    mockDb.accountingJournalEntry.findFirst.mockResolvedValue({ ...pending, status: "POSTED" });

    await expect(accounting.approveJournalEntry("org-1", "journal-1", "user-approver")).rejects.toBeInstanceOf(accounting.JournalApprovalError);
    expect(mockDb.accountingJournalEntry.updateMany).not.toHaveBeenCalled();
  });

  it("rejects approving an entry that does not exist in this organization", async () => {
    mockDb.accountingJournalEntry.findFirst.mockResolvedValue(null);

    await expect(accounting.approveJournalEntry("org-1", "journal-1", "user-approver")).rejects.toBeInstanceOf(accounting.NotFoundError);
  });
});

describe("rejectJournalEntry", () => {
  const pending = { id: "journal-1", organizationId: "org-1", status: "PENDING_APPROVAL", submittedById: "user-submitter" };

  it("requires a non-empty reason before touching the row", async () => {
    await expect(accounting.rejectJournalEntry("org-1", "journal-1", "user-approver", "   ")).rejects.toBeInstanceOf(accounting.JournalApprovalError);
    expect(mockDb.accountingJournalEntry.findFirst).not.toHaveBeenCalled();
  });

  it("sets REJECTED and the trimmed reason, and does not require the submitter guard", async () => {
    mockDb.accountingJournalEntry.findFirst.mockResolvedValue(pending);
    mockDb.accountingJournalEntry.updateMany.mockResolvedValue({ count: 1 });
    mockDb.accountingJournalEntry.findUniqueOrThrow.mockResolvedValue({ ...pending, status: "REJECTED" });

    await accounting.rejectJournalEntry("org-1", "journal-1", "user-approver", "  Missing supporting invoice  ");

    expect(mockDb.accountingJournalEntry.updateMany).toHaveBeenCalledWith({
      where: { id: "journal-1", organizationId: "org-1", status: "PENDING_APPROVAL" },
      data: expect.objectContaining({ status: "REJECTED", rejectedReason: "Missing supporting invoice" }),
    });
  });

  it("rejects rejecting an entry that is not awaiting approval", async () => {
    mockDb.accountingJournalEntry.findFirst.mockResolvedValue({ ...pending, status: "REVERSED" });

    await expect(accounting.rejectJournalEntry("org-1", "journal-1", "user-approver", "reason")).rejects.toBeInstanceOf(accounting.JournalApprovalError);
    expect(mockDb.accountingJournalEntry.updateMany).not.toHaveBeenCalled();
  });
});

describe("balance-affecting reads exclude PENDING_APPROVAL and REJECTED journal lines", () => {
  it("listAccounts filters journalLines by status", async () => {
    mockDb.accountingAccount.findMany.mockResolvedValue([]);

    await accounting.listAccounts("org-1");

    const lastCall = mockDb.accountingAccount.findMany.mock.calls.at(-1)![0];
    expect(lastCall.include.journalLines.where.journalEntry.status.notIn).toEqual(
      expect.arrayContaining(["PENDING_APPROVAL", "REJECTED"]),
    );
  });

  it("getCashbook filters journal lines by status", async () => {
    mockDb.accountingAccount.findMany.mockResolvedValue([{ id: "acct-cash" }]);
    mockDb.accountingJournalLine.findMany.mockResolvedValue([]);

    await accounting.getCashbook("org-1");

    const call = mockDb.accountingJournalLine.findMany.mock.calls[0][0];
    expect(call.where.journalEntry.status.notIn).toEqual(expect.arrayContaining(["PENDING_APPROVAL", "REJECTED"]));
  });

  it("getTrialBalance filters journalLines by status alongside the as-of date", async () => {
    mockDb.accountingAccount.findMany.mockResolvedValue([]);

    await accounting.getTrialBalance("org-1", new Date("2026-08-31"));

    const lastCall = mockDb.accountingAccount.findMany.mock.calls.at(-1)![0];
    expect(lastCall.include.journalLines.where.journalEntry.status.notIn).toEqual(
      expect.arrayContaining(["PENDING_APPROVAL", "REJECTED"]),
    );
  });

  it("getGeneralLedgerForAccount filters journal lines by status", async () => {
    mockDb.accountingAccount.findFirst.mockResolvedValue({ id: "acct-1", code: "1000", name: "Cash", type: "ASSET" });
    mockDb.accountingJournalLine.findMany.mockResolvedValue([]);

    await accounting.getGeneralLedgerForAccount("org-1", "acct-1");

    const call = mockDb.accountingJournalLine.findMany.mock.calls[0][0];
    expect(call.where.journalEntry.status.notIn).toEqual(expect.arrayContaining(["PENDING_APPROVAL", "REJECTED"]));
  });

  it("getCashFlowStatement filters both the period and prior-period journal lines by status", async () => {
    mockDb.accountingAccount.findMany.mockResolvedValue([{ id: "acct-cash" }]);
    mockDb.accountingJournalLine.findMany.mockResolvedValue([]);

    await accounting.getCashFlowStatement("org-1", new Date("2026-08-01"), new Date("2026-08-31"));

    const periodCall = mockDb.accountingJournalLine.findMany.mock.calls[0][0];
    const priorCall = mockDb.accountingJournalLine.findMany.mock.calls[1][0];
    expect(periodCall.where.journalEntry.status.notIn).toEqual(expect.arrayContaining(["PENDING_APPROVAL", "REJECTED"]));
    expect(priorCall.where.journalEntry.status.notIn).toEqual(expect.arrayContaining(["PENDING_APPROVAL", "REJECTED"]));
  });
});
