import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = {
  inventoryCount: {
    findFirst: vi.fn(),
    findFirstOrThrow: vi.fn(),
    updateMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
  },
  inventoryCountLine: { findFirst: vi.fn(), update: vi.fn() },
  inventoryWarehouse: { findFirst: vi.fn() },
  inventoryItem: { findMany: vi.fn() },
  inventoryStock: { createMany: vi.fn(), findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  inventoryMovement: { create: vi.fn() },
  $executeRaw: vi.fn(),
  $queryRaw: vi.fn(),
  $transaction: vi.fn(),
};

vi.mock("@/lib/db", () => ({ db: mockDb }));

const inventory = await import("@/modules/inventory/service");
const ORG = "org-1";

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.$transaction.mockImplementation(async (fn: (tx: typeof mockDb) => Promise<unknown>) => fn(mockDb));
});

describe("inventory stock counts", () => {
  it("scopes count-line updates to the organization and draft count", async () => {
    mockDb.inventoryCountLine.findFirst.mockResolvedValue(null);

    await expect(inventory.updateInventoryCountLine(ORG, "count-1", "line-1", 12)).rejects.toThrow(inventory.InventoryCountStateError);
    expect(mockDb.inventoryCountLine.findFirst).toHaveBeenCalledWith({
      where: { id: "line-1", countId: "count-1", count: { organizationId: ORG, status: "DRAFT" } },
    });
    expect(mockDb.inventoryCountLine.update).not.toHaveBeenCalled();
  });

  it("does not submit a count while any line is incomplete", async () => {
    mockDb.inventoryCount.findFirst.mockResolvedValue({ id: "count-1", lines: [{ countedQuantity: 2 }, { countedQuantity: null }] });

    await expect(inventory.submitInventoryCount(ORG, "count-1")).rejects.toThrow(inventory.InventoryCountStateError);
    expect(mockDb.inventoryCount.updateMany).not.toHaveBeenCalled();
  });

  it("enforces maker-checker separation and a rejection reason", async () => {
    mockDb.inventoryCount.findFirst.mockResolvedValue({ id: "count-1", createdById: "maker-1" });

    await expect(inventory.reviewInventoryCount(ORG, "count-1", { decision: "APPROVE", actorId: "maker-1" })).rejects.toThrow(inventory.InventoryCountApprovalError);
    await expect(inventory.reviewInventoryCount(ORG, "count-1", { decision: "REJECT", actorId: "reviewer-1", reason: " " })).rejects.toThrow(inventory.InventoryCountApprovalError);
    expect(mockDb.inventoryCount.updateMany).not.toHaveBeenCalled();
  });

  it("claims an approved count before posting so a replay cannot adjust stock twice", async () => {
    mockDb.inventoryCount.findFirst.mockResolvedValue({ id: "count-1", warehouseId: "warehouse-1", countNumber: "CNT-000001", countDate: new Date("2026-08-21"), lines: [] });
    mockDb.inventoryCount.updateMany.mockResolvedValue({ count: 0 });

    await expect(inventory.postInventoryCount(ORG, "count-1", "reviewer-1")).rejects.toThrow(inventory.InventoryCountStateError);
    expect(mockDb.inventoryStock.createMany).not.toHaveBeenCalled();
    expect(mockDb.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it("posts the variance against the current locked stock, not the stale snapshot", async () => {
    const count = {
      id: "count-1",
      warehouseId: "warehouse-1",
      countNumber: "CNT-000001",
      countDate: new Date("2026-08-21"),
      lines: [{ itemId: "item-1", expectedQuantity: 8, countedQuantity: 12 }],
    };
    mockDb.inventoryCount.findFirst.mockResolvedValue(count);
    mockDb.inventoryCount.updateMany.mockResolvedValue({ count: 1 });
    mockDb.$queryRaw.mockResolvedValue([{ id: "stock-1", quantity: 10 }]);
    mockDb.inventoryStock.findUniqueOrThrow.mockResolvedValue({ id: "stock-1", quantity: 10 });
    mockDb.inventoryStock.update.mockResolvedValue({});
    mockDb.inventoryMovement.create.mockResolvedValue({ id: "movement-1" });
    mockDb.inventoryCount.findFirstOrThrow.mockResolvedValue({ ...count, status: "POSTED" });

    await inventory.postInventoryCount(ORG, "count-1", "reviewer-1");

    expect(mockDb.inventoryStock.update).toHaveBeenCalledWith({ where: { id: "stock-1" }, data: { quantity: { increment: 2 } } });
    expect(mockDb.inventoryMovement.create).toHaveBeenCalledWith({ data: expect.objectContaining({ organizationId: ORG, itemId: "item-1", quantity: 2, reference: "CNT-000001" }) });
  });

  it("only snapshots inventory-tracked items into a new physical count, not Service-type items", async () => {
    mockDb.inventoryWarehouse.findFirst.mockResolvedValue({ id: "warehouse-1", active: true });
    mockDb.inventoryItem.findMany.mockResolvedValue([{ id: "item-1", stock: [{ quantity: 5 }] }]);
    mockDb.inventoryCount.count.mockResolvedValue(0);
    mockDb.inventoryCount.create.mockResolvedValue({ id: "count-1" });

    await inventory.createInventoryCount(ORG, { warehouseId: "warehouse-1", countDate: new Date("2026-08-24") });

    expect(mockDb.inventoryItem.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId: ORG, active: true, trackInventory: true },
    }));
  });
});
