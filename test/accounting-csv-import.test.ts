import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = {
  accountingAccount: { createMany: vi.fn() },
  accountingContact: { findMany: vi.fn(), createMany: vi.fn() },
};

vi.mock("@/lib/db", () => ({ db: mockDb }));

const accounting = await import("@/modules/accounting/service");

const ORG = "org-1";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("importAccountsFromCsv", () => {
  it("does nothing for an empty batch", async () => {
    const result = await accounting.importAccountsFromCsv(ORG, []);

    expect(result).toEqual({ importedCount: 0, skippedCount: 0 });
    expect(mockDb.accountingAccount.createMany).not.toHaveBeenCalled();
  });

  it("skips a row whose code already exists for this organization, without duplicating it", async () => {
    mockDb.accountingAccount.createMany.mockResolvedValue({ count: 1 });

    const result = await accounting.importAccountsFromCsv(ORG, [
      { code: "1010", name: "Bank - GHS", type: "ASSET" },
      { code: "1000", name: "Cash (duplicate of the system account)", type: "ASSET" },
    ]);

    expect(mockDb.accountingAccount.createMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }));
    expect(result).toEqual({ importedCount: 1, skippedCount: 1 });
  });

  it("defaults liquidityType to NONE when the CSV did not supply one", async () => {
    mockDb.accountingAccount.createMany.mockResolvedValue({ count: 1 });

    await accounting.importAccountsFromCsv(ORG, [{ code: "5900", name: "Misc Expense", type: "EXPENSE" }]);

    const call = mockDb.accountingAccount.createMany.mock.calls[0][0];
    expect(call.data[0].liquidityType).toBe("NONE");
  });
});

describe("importContactsFromCsv", () => {
  it("does nothing for an empty batch", async () => {
    const result = await accounting.importContactsFromCsv(ORG, []);

    expect(result).toEqual({ importedCount: 0, skippedCount: 0 });
    expect(mockDb.accountingContact.createMany).not.toHaveBeenCalled();
  });

  it("skips a row whose email already belongs to an existing contact", async () => {
    mockDb.accountingContact.findMany.mockResolvedValue([{ email: "Supplier@Example.com" }]);
    mockDb.accountingContact.createMany.mockResolvedValue({ count: 1 });

    const result = await accounting.importContactsFromCsv(ORG, [
      { type: "SUPPLIER", name: "Existing supplier", email: "supplier@example.com" },
      { type: "CUSTOMER", name: "New customer", email: "new@example.com" },
    ]);

    expect(result).toEqual({ importedCount: 1, skippedCount: 1 });
    const call = mockDb.accountingContact.createMany.mock.calls[0][0];
    expect(call.data).toHaveLength(1);
    expect(call.data[0].name).toBe("New customer");
  });

  it("collapses two rows in the same file that share an email, keeping only the first", async () => {
    mockDb.accountingContact.findMany.mockResolvedValue([]);
    mockDb.accountingContact.createMany.mockResolvedValue({ count: 1 });

    const result = await accounting.importContactsFromCsv(ORG, [
      { type: "CUSTOMER", name: "First occurrence", email: "dup@example.com" },
      { type: "CUSTOMER", name: "Second occurrence", email: "dup@example.com" },
    ]);

    expect(result).toEqual({ importedCount: 1, skippedCount: 1 });
    const call = mockDb.accountingContact.createMany.mock.calls[0][0];
    expect(call.data[0].name).toBe("First occurrence");
  });

  it("always creates a row with no email - there is no key to dedupe it by", async () => {
    mockDb.accountingContact.findMany.mockResolvedValue([]);
    mockDb.accountingContact.createMany.mockResolvedValue({ count: 2 });

    const result = await accounting.importContactsFromCsv(ORG, [
      { type: "CUSTOMER", name: "Walk-in customer" },
      { type: "CUSTOMER", name: "Another walk-in customer" },
    ]);

    expect(result).toEqual({ importedCount: 2, skippedCount: 0 });
  });
});
