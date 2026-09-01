import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = {
  accountingPeriod: { findFirst: vi.fn() },
  accountingAccount: { count: vi.fn(), findFirst: vi.fn() },
  branch: { count: vi.fn() },
  accountingJournalEntry: { findFirst: vi.fn(), count: vi.fn(), create: vi.fn() },
  accountingRecurringTemplate: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  $executeRaw: vi.fn(),
  $transaction: vi.fn(),
};

vi.mock("@/lib/db", () => ({ db: mockDb }));

const accounting = await import("@/modules/accounting/service");

const ORG = "org-1";

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.$transaction.mockImplementation(async (callback: (tx: typeof mockDb) => Promise<unknown>) => callback(mockDb));
  mockDb.accountingPeriod.findFirst.mockResolvedValue(null);
  mockDb.accountingAccount.count.mockResolvedValue(2);
  mockDb.branch.count.mockResolvedValue(1);
  mockDb.accountingJournalEntry.count.mockResolvedValue(0);
  mockDb.accountingJournalEntry.findFirst.mockResolvedValue(null);
  mockDb.accountingJournalEntry.create.mockResolvedValue({ id: "journal-1" });
});

function journalTemplate(overrides: Record<string, unknown> = {}) {
  return {
    id: "template-1",
    organizationId: ORG,
    type: "JOURNAL_ENTRY",
    name: "Monthly rent accrual",
    frequency: "MONTHLY",
    nextRunDate: new Date("2026-08-01"),
    active: true,
    lastGeneratedAt: null,
    createdById: "user-1",
    payload: {
      type: "JOURNAL_ENTRY",
      description: "Rent accrual",
      reference: null,
      lines: [
        { accountId: "expense", debit: "1200.00" },
        { accountId: "cash", credit: "1200.00" },
      ],
    },
    ...overrides,
  };
}

describe("generateDueRecurringTransactions", () => {
  it("generates exactly one document for a due template and advances its nextRunDate by its frequency", async () => {
    const template = journalTemplate();
    mockDb.accountingRecurringTemplate.findMany.mockResolvedValue([template]);
    mockDb.accountingRecurringTemplate.update.mockResolvedValue({ ...template, nextRunDate: new Date("2026-09-01") });

    const result = await accounting.generateDueRecurringTransactions(new Date("2026-08-05"));

    expect(mockDb.accountingJournalEntry.create).toHaveBeenCalledTimes(1);
    expect(mockDb.accountingRecurringTemplate.update).toHaveBeenCalledWith({
      where: { id: "template-1" },
      data: expect.objectContaining({ nextRunDate: new Date("2026-09-01"), lastGeneratedAt: new Date("2026-08-05") }),
    });
    expect(result).toEqual({ candidates: 1, generated: 1, failures: [] });
  });

  it("only queries active templates due on or before the given date - a paused template is never selected", async () => {
    mockDb.accountingRecurringTemplate.findMany.mockResolvedValue([]);

    await accounting.generateDueRecurringTransactions(new Date("2026-08-05"));

    const call = mockDb.accountingRecurringTemplate.findMany.mock.calls[0][0];
    expect(call.where.active).toBe(true);
    expect(call.where.nextRunDate.lte).toEqual(new Date("2026-08-05"));
  });

  it("advances WEEKLY, QUARTERLY, and YEARLY templates by the correct interval", async () => {
    const cases: [string, Date][] = [
      ["WEEKLY", new Date("2026-08-08")],
      ["QUARTERLY", new Date("2026-11-01")],
      ["YEARLY", new Date("2027-08-01")],
    ];
    for (const [frequency, expectedNext] of cases) {
      vi.clearAllMocks();
      mockDb.$transaction.mockImplementation(async (callback: (tx: typeof mockDb) => Promise<unknown>) => callback(mockDb));
      mockDb.accountingPeriod.findFirst.mockResolvedValue(null);
      mockDb.accountingAccount.count.mockResolvedValue(2);
      mockDb.branch.count.mockResolvedValue(1);
      mockDb.accountingJournalEntry.count.mockResolvedValue(0);
      mockDb.accountingJournalEntry.findFirst.mockResolvedValue(null);
      mockDb.accountingJournalEntry.create.mockResolvedValue({ id: "journal-1" });
      const template = journalTemplate({ frequency, nextRunDate: new Date("2026-08-01") });
      mockDb.accountingRecurringTemplate.findMany.mockResolvedValue([template]);
      mockDb.accountingRecurringTemplate.update.mockResolvedValue(template);

      await accounting.generateDueRecurringTransactions(new Date("2026-08-05"));

      expect(mockDb.accountingRecurringTemplate.update).toHaveBeenCalledWith({
        where: { id: "template-1" },
        data: expect.objectContaining({ nextRunDate: expectedNext }),
      });
    }
  });

  it("isolates a failure to one template - other due templates still generate, and the failure is reported rather than thrown", async () => {
    const broken = journalTemplate({ id: "template-broken", payload: { type: "BILL", description: "mismatched type" } });
    const healthy = journalTemplate({ id: "template-healthy" });
    mockDb.accountingRecurringTemplate.findMany.mockResolvedValue([broken, healthy]);
    mockDb.accountingRecurringTemplate.update.mockResolvedValue(healthy);

    const result = await accounting.generateDueRecurringTransactions(new Date("2026-08-05"));

    expect(result.candidates).toBe(2);
    expect(result.generated).toBe(1);
    expect(result.failures).toEqual([{ templateId: "template-broken", name: "Monthly rent accrual", error: expect.any(String) }]);
    // The broken template's schedule is never advanced - a failure never silently skips a period.
    expect(mockDb.accountingRecurringTemplate.update).toHaveBeenCalledTimes(1);
    expect(mockDb.accountingRecurringTemplate.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "template-healthy" } }));
  });
});

describe("runRecurringTemplateNow", () => {
  it("produces the same result as the cron path: generates and advances even when not yet due", async () => {
    const template = journalTemplate({ nextRunDate: new Date("2026-12-01") });
    mockDb.accountingRecurringTemplate.findFirst.mockResolvedValue(template);
    mockDb.accountingRecurringTemplate.update.mockResolvedValue({ ...template, nextRunDate: new Date("2027-01-01") });

    await accounting.runRecurringTemplateNow(ORG, "template-1");

    expect(mockDb.accountingJournalEntry.create).toHaveBeenCalledTimes(1);
    expect(mockDb.accountingRecurringTemplate.update).toHaveBeenCalledWith({
      where: { id: "template-1" },
      data: expect.objectContaining({ nextRunDate: new Date("2027-01-01") }),
    });
  });

  it("rejects running a template that does not exist or is paused", async () => {
    mockDb.accountingRecurringTemplate.findFirst.mockResolvedValue(null);

    await expect(accounting.runRecurringTemplateNow(ORG, "missing")).rejects.toBeInstanceOf(accounting.NotFoundError);
    expect(mockDb.accountingJournalEntry.create).not.toHaveBeenCalled();
  });
});

describe("recurring template CRUD", () => {
  it("createRecurringTemplate stores the payload as the template's own type", async () => {
    mockDb.accountingRecurringTemplate.create.mockResolvedValue({ id: "template-2" });

    await accounting.createRecurringTemplate(ORG, {
      name: "Monthly rent accrual",
      frequency: "MONTHLY",
      nextRunDate: new Date("2026-09-01"),
      payload: { type: "JOURNAL_ENTRY", description: "Rent", lines: [{ accountId: "a", debit: "100" }, { accountId: "b", credit: "100" }] },
      createdById: "user-1",
    });

    expect(mockDb.accountingRecurringTemplate.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: "JOURNAL_ENTRY", organizationId: ORG }),
    }));
  });

  it("setRecurringTemplateActive rejects a template that does not exist in this organization", async () => {
    mockDb.accountingRecurringTemplate.updateMany.mockResolvedValue({ count: 0 });

    await expect(accounting.setRecurringTemplateActive(ORG, "missing", false)).rejects.toBeInstanceOf(accounting.NotFoundError);
  });

  it("setRecurringTemplateActive pauses a template scoped to its organization", async () => {
    mockDb.accountingRecurringTemplate.updateMany.mockResolvedValue({ count: 1 });

    await accounting.setRecurringTemplateActive(ORG, "template-1", false);

    expect(mockDb.accountingRecurringTemplate.updateMany).toHaveBeenCalledWith({ where: { id: "template-1", organizationId: ORG }, data: { active: false } });
  });
});
