import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = {
  organizationModule: { findFirst: vi.fn() },
  subscription: { findMany: vi.fn() },
  accountingAccount: { findFirst: vi.fn(), create: vi.fn(), findFirstOrThrow: vi.fn() },
  accountingJournalEntry: { findFirst: vi.fn() },
};

vi.mock("@/lib/db", () => ({ db: mockDb }));

const mockAccounting = {
  ensureDefaultAccounts: vi.fn(),
  postSourceJournalEntry: vi.fn(),
  reverseJournalEntry: vi.fn(),
};

vi.mock("@/modules/accounting/service", () => mockAccounting);

const integration = await import("@/lib/accounting-integration");

beforeEach(() => {
  vi.clearAllMocks();
});

const CASH_ACCOUNT = { id: "acct-cash", code: "1000", name: "Cash" };

describe("isModuleActiveForOrg", () => {
  it("returns false when the org has no enabled+active assignment for the module", async () => {
    mockDb.organizationModule.findFirst.mockResolvedValue(null);
    mockDb.subscription.findMany.mockResolvedValue([]);
    await expect(integration.isModuleActiveForOrg(mockDb as never, "org-1", "accounting")).resolves.toBe(false);
  });

  it("returns true when assigned and no subscription record gates the module at all", async () => {
    mockDb.organizationModule.findFirst.mockResolvedValue({ id: "assignment-1" });
    mockDb.subscription.findMany.mockResolvedValue([]);
    await expect(integration.isModuleActiveForOrg(mockDb as never, "org-1", "accounting")).resolves.toBe(true);
  });

  it("returns false when subscription records exist but none is currently active and date-valid", async () => {
    mockDb.organizationModule.findFirst.mockResolvedValue({ id: "assignment-1" });
    mockDb.subscription.findMany.mockResolvedValue([{ status: "EXPIRED", startsAt: new Date("2020-01-01"), endsAt: new Date("2020-02-01") }]);
    await expect(integration.isModuleActiveForOrg(mockDb as never, "org-1", "accounting")).resolves.toBe(false);
  });

  it("returns true when a currently-active, date-valid subscription exists", async () => {
    const now = new Date();
    mockDb.organizationModule.findFirst.mockResolvedValue({ id: "assignment-1" });
    mockDb.subscription.findMany.mockResolvedValue([{ status: "ACTIVE", startsAt: new Date(now.getTime() - 86_400_000), endsAt: new Date(now.getTime() + 86_400_000) }]);
    await expect(integration.isModuleActiveForOrg(mockDb as never, "org-1", "accounting")).resolves.toBe(true);
  });
});

describe("postModuleRevenue", () => {
  const baseInput = {
    sourceModule: "fleet" as const,
    sourceType: "FLEET_PAYMENT",
    sourceId: "payment-1",
    postingPurpose: "COLLECTED",
    amount: "100.00",
    entryDate: new Date("2026-08-20"),
    description: "Fleet payment verified: REF-1",
    createdById: "user-1",
  };

  it("no-ops without touching Accounting when the organization hasn't activated it — never blocks the source module", async () => {
    mockDb.organizationModule.findFirst.mockResolvedValue(null);
    const result = await integration.postModuleRevenue("org-1", baseInput);
    expect(result).toEqual({ posted: false, reason: "accounting-not-enabled" });
    expect(mockAccounting.postSourceJournalEntry).not.toHaveBeenCalled();
    expect(mockDb.accountingAccount.create).not.toHaveBeenCalled();
  });

  it("posts a balanced debit-Cash/credit-module-revenue entry when Accounting is active", async () => {
    mockDb.organizationModule.findFirst.mockResolvedValue({ id: "assignment-1" });
    mockDb.subscription.findMany.mockResolvedValue([]);
    mockAccounting.ensureDefaultAccounts.mockResolvedValue([CASH_ACCOUNT]);
    mockDb.accountingAccount.findFirst.mockResolvedValue({ id: "acct-fleet-revenue", code: "4100", name: "Fleet Revenue" });
    mockAccounting.postSourceJournalEntry.mockResolvedValue({ id: "journal-1" });

    const result = await integration.postModuleRevenue("org-1", baseInput);

    expect(result).toEqual({ posted: true, journalEntryId: "journal-1" });
    expect(mockAccounting.postSourceJournalEntry).toHaveBeenCalledWith("org-1", expect.objectContaining({
      sourceType: "FLEET_PAYMENT",
      sourceId: "payment-1",
      postingPurpose: "COLLECTED",
      lines: [
        { accountId: "acct-cash", debit: "100.00" },
        { accountId: "acct-fleet-revenue", credit: "100.00" },
      ],
    }));
  });

  it("creates the module's revenue account on first use and reuses it afterwards", async () => {
    mockDb.organizationModule.findFirst.mockResolvedValue({ id: "assignment-1" });
    mockDb.subscription.findMany.mockResolvedValue([]);
    mockAccounting.ensureDefaultAccounts.mockResolvedValue([CASH_ACCOUNT]);
    mockDb.accountingAccount.findFirst.mockResolvedValueOnce(null);
    mockDb.accountingAccount.create.mockResolvedValue({ id: "acct-pharmacy-revenue", code: "4200", name: "Pharmacy Revenue" });
    mockAccounting.postSourceJournalEntry.mockResolvedValue({ id: "journal-2" });

    await integration.postModuleRevenue("org-1", { ...baseInput, sourceModule: "pharmacy", sourceType: "PHARMACY_DISPENSING" });

    expect(mockDb.accountingAccount.create).toHaveBeenCalledWith({ data: { organizationId: "org-1", code: "4200", name: "Pharmacy Revenue", type: "REVENUE", isSystem: true } });
  });

  it("never throws — a failure inside Accounting is caught and reported, not propagated to the caller", async () => {
    mockDb.organizationModule.findFirst.mockResolvedValue({ id: "assignment-1" });
    mockDb.subscription.findMany.mockResolvedValue([]);
    mockAccounting.ensureDefaultAccounts.mockRejectedValue(new Error("db unavailable"));

    await expect(integration.postModuleRevenue("org-1", baseInput)).resolves.toEqual({ posted: false, reason: "error" });
  });

  it("labels every declared source module for the Revenue by source statement", () => {
    for (const key of ["fleet", "pharmacy", "hospital", "pos", "installment", "hostel", "hotel", "school"] as const) {
      expect(typeof integration.moduleRevenueLabel(key)).toBe("string");
      expect(integration.moduleRevenueLabel(key).length).toBeGreaterThan(0);
    }
  });
});

describe("reverseModuleRevenue", () => {
  it("no-ops (not an error) when nothing was ever posted for this source — the expected case when Accounting wasn't enabled at posting time", async () => {
    mockDb.accountingJournalEntry.findFirst.mockResolvedValue(null);
    const result = await integration.reverseModuleRevenue("org-1", { sourceType: "FLEET_PAYMENT", sourceId: "payment-1", postingPurpose: "COLLECTED", reason: "rejected" });
    expect(result).toEqual({ posted: false, reason: "accounting-not-enabled" });
    expect(mockAccounting.reverseJournalEntry).not.toHaveBeenCalled();
  });

  it("delegates to Accounting's own reverseJournalEntry once the original posting is located", async () => {
    mockDb.accountingJournalEntry.findFirst.mockResolvedValue({ id: "journal-1" });
    mockAccounting.reverseJournalEntry.mockResolvedValue({ id: "journal-2" });

    const result = await integration.reverseModuleRevenue("org-1", { sourceType: "FLEET_PAYMENT", sourceId: "payment-1", postingPurpose: "COLLECTED", reason: "rejected", actorId: "user-1" });

    expect(result).toEqual({ posted: true, journalEntryId: "journal-2" });
    expect(mockAccounting.reverseJournalEntry).toHaveBeenCalledWith("org-1", "journal-1", expect.objectContaining({ reason: "rejected", actorId: "user-1" }));
  });

  it("never throws on failure", async () => {
    mockDb.accountingJournalEntry.findFirst.mockRejectedValue(new Error("db unavailable"));
    await expect(integration.reverseModuleRevenue("org-1", { sourceType: "FLEET_PAYMENT", sourceId: "payment-1", postingPurpose: "COLLECTED", reason: "x" })).resolves.toEqual({ posted: false, reason: "error" });
  });
});
