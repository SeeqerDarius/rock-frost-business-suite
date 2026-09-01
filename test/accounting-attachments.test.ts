import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = {
  accountingAttachment: { findMany: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
  fileAsset: { create: vi.fn() },
  $transaction: vi.fn(),
};

vi.mock("@/lib/db", () => ({ db: mockDb }));

const accounting = await import("@/modules/accounting/service");

const ORG_A = "org-a";
const ORG_B = "org-b";

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.$transaction.mockImplementation(async (callback: (tx: typeof mockDb) => Promise<unknown>) => callback(mockDb));
});

describe("createAccountingAttachment", () => {
  it("creates a FileAsset and links it through a new AccountingAttachment in one transaction", async () => {
    mockDb.fileAsset.create.mockResolvedValue({ id: "asset-1" });
    mockDb.accountingAttachment.create.mockResolvedValue({ id: "att-1", fileAssetId: "asset-1" });

    await accounting.createAccountingAttachment(ORG_A, {
      entityType: "BILL",
      entityId: "bill-1",
      fileName: "invoice.pdf",
      mimeType: "application/pdf",
      size: 1234,
      dataUrl: "data:application/pdf;base64,AAAA",
      uploadedById: "user-1",
    });

    expect(mockDb.fileAsset.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ organizationId: ORG_A, fileName: "invoice.pdf", mimeType: "application/pdf" }),
    }));
    expect(mockDb.accountingAttachment.create).toHaveBeenCalledWith({
      data: { organizationId: ORG_A, entityType: "BILL", entityId: "bill-1", fileAssetId: "asset-1", caption: undefined, uploadedById: "user-1" },
    });
  });
});

describe("listAccountingAttachments: tenant isolation", () => {
  it("scopes the query to the requesting organization, not the entity alone", async () => {
    mockDb.accountingAttachment.findMany.mockResolvedValue([]);

    await accounting.listAccountingAttachments(ORG_A, "BILL", "bill-1");

    expect(mockDb.accountingAttachment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId: ORG_A, entityType: "BILL", entityId: "bill-1" },
    }));
  });
});

describe("deleteAccountingAttachment: tenant isolation", () => {
  it("cannot delete an attachment belonging to another organization", async () => {
    mockDb.accountingAttachment.deleteMany.mockResolvedValue({ count: 0 });

    await expect(accounting.deleteAccountingAttachment(ORG_B, "att-1")).rejects.toBeInstanceOf(accounting.NotFoundError);
    expect(mockDb.accountingAttachment.deleteMany).toHaveBeenCalledWith({ where: { id: "att-1", organizationId: ORG_B } });
  });

  it("deletes an attachment that does belong to the requesting organization", async () => {
    mockDb.accountingAttachment.deleteMany.mockResolvedValue({ count: 1 });

    await expect(accounting.deleteAccountingAttachment(ORG_A, "att-1")).resolves.toBeUndefined();
  });
});
