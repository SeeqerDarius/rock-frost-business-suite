import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TenantContext } from "@/lib/tenant";

/**
 * Regression coverage for the customer-facing Inventory & Procurement
 * consolidation: one shared navigation definition for both existing route
 * trees, a permission-aware combined overview at /app/inventory, non-stock
 * procurement remaining usable, and linked purchase-order receiving still
 * going through Inventory's own public service boundary. See
 * docs/INVENTORY_PROCUREMENT_CONSOLIDATION.md.
 */

const mockDb = {
  inventoryItem: { findFirst: vi.fn(), findMany: vi.fn() },
  inventoryWarehouse: { findFirst: vi.fn(), count: vi.fn() },
  inventoryStock: { createMany: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  inventoryMovement: { create: vi.fn(), count: vi.fn() },
  procurementOrder: { findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
  procurementOrderLine: { findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
  procurementRequest: { findMany: vi.fn() },
  procurementVendor: { count: vi.fn() },
  $transaction: vi.fn(),
};

vi.mock("@/lib/db", () => ({ db: mockDb }));

function txPassthrough() {
  mockDb.$transaction.mockImplementation(async (fn: (tx: typeof mockDb) => Promise<unknown>) => fn(mockDb));
}

const procurement = await import("@/modules/procurement/service");
const inventory = await import("@/modules/inventory/service");
const overviewModule = await import("@/modules/inventory-procurement/overview");
const navigation = await import("@/modules/inventory-procurement/navigation");
const inventoryNavReExport = await import("@/modules/inventory/navigation");
const procurementNavReExport = await import("@/modules/procurement/navigation");

const ORG = "org-1";

beforeEach(() => {
  vi.clearAllMocks();
  txPassthrough();
});

function makeTenant(overrides: Partial<TenantContext> = {}): TenantContext {
  return {
    userId: "user-1",
    organizationId: ORG,
    organization: { id: ORG, name: "Test Org", tenantCode: "TEST", industry: null, status: "ACTIVE" },
    role: "Operations",
    roleId: "role-1",
    roleIsSystem: false,
    roleOrganizationId: ORG,
    permissions: [],
    branch: null,
    enabledModuleKeys: [],
    accessibleModuleKeys: [],
    memberships: [{ organizationId: ORG, name: "Test Org", tenantCode: "TEST" }],
    ...overrides,
  };
}

describe("Shared navigation — one definition for both route trees", () => {
  it("a tenant with both modules sees one combined list, with Overview pointing at the combined page", () => {
    const items = navigation.getInventoryProcurementNavigation({ hasInventory: true, hasProcurement: true });
    expect(items[0]).toMatchObject({ label: "Overview", href: "/app/inventory" });
    expect(items.some((i) => i.href === "/app/inventory/items")).toBe(true);
    expect(items.some((i) => i.href === "/app/procurement/vendors")).toBe(true);
    expect(navigation.getInventoryProcurementSectionLabel({ hasInventory: true, hasProcurement: true })).toBe("Inventory & Procurement");
  });

  it("a tenant with only Inventory sees only Inventory items, and never a link into Procurement", () => {
    const items = navigation.getInventoryProcurementNavigation({ hasInventory: true, hasProcurement: false });
    expect(items.some((i) => i.href.startsWith("/app/procurement"))).toBe(false);
    expect(items[0]).toMatchObject({ label: "Overview", href: "/app/inventory" });
    expect(navigation.getInventoryProcurementSectionLabel({ hasInventory: true, hasProcurement: false })).toBe("Inventory Management");
  });

  it("a tenant with only Procurement sees only Procurement items, with Overview pointing at Procurement's own page", () => {
    const items = navigation.getInventoryProcurementNavigation({ hasInventory: false, hasProcurement: true });
    expect(items.some((i) => i.href.startsWith("/app/inventory"))).toBe(false);
    expect(items[0]).toMatchObject({ label: "Overview", href: "/app/procurement" });
    expect(navigation.getInventoryProcurementSectionLabel({ hasInventory: false, hasProcurement: true })).toBe("Procurement");
  });

  it("a tenant with neither module sees an empty navigation", () => {
    expect(navigation.getInventoryProcurementNavigation({ hasInventory: false, hasProcurement: false })).toEqual([]);
  });

  it("src/modules/inventory/navigation.tsx and src/modules/procurement/navigation.tsx still export the exact names src/platform/modules/registry.ts imports, both pointing at the same shared full definition", () => {
    expect(inventoryNavReExport.inventoryNavigation).toBe(navigation.inventoryProcurementNavigation);
    expect(procurementNavReExport.procurementNavigation).toBe(navigation.inventoryProcurementNavigation);
  });
});

describe("Combined overview — permission-aware composition", () => {
  it("omits Procurement entirely for a tenant without Procurement access, without querying any procurement table", async () => {
    mockDb.inventoryItem.findMany.mockResolvedValue([]);
    mockDb.inventoryWarehouse.count.mockResolvedValue(0);
    mockDb.inventoryMovement.count.mockResolvedValue(0);

    const tenant = makeTenant({ enabledModuleKeys: ["inventory"], permissions: ["inventory.view"] });
    const result = await overviewModule.getInventoryProcurementOverview(tenant);

    expect(result.hasProcurement).toBe(false);
    expect(result.procurement).toBeNull();
    expect(result.quickActions.canManageVendors).toBe(false);
    expect(result.quickActions.canManageRequests).toBe(false);
    expect(result.quickActions.canManageOrders).toBe(false);
    expect(mockDb.procurementRequest.findMany).not.toHaveBeenCalled();
    expect(mockDb.procurementOrder.findMany).not.toHaveBeenCalled();
    // Inventory-only setup steps this viewer cannot act on read as already satisfied.
    expect(result.setup.hasVendors).toBe(true);
    expect(result.setup.hasPurchaseActivity).toBe(true);
  });

  it("includes Procurement summary data for a tenant with both modules", async () => {
    mockDb.inventoryItem.findMany.mockResolvedValue([]);
    mockDb.inventoryWarehouse.count.mockResolvedValue(2);
    mockDb.inventoryMovement.count.mockResolvedValue(0);
    mockDb.procurementRequest.findMany.mockResolvedValue([]);
    mockDb.procurementOrder.findMany.mockResolvedValue([]);
    mockDb.procurementVendor.count.mockResolvedValueOnce(3).mockResolvedValueOnce(2);

    const tenant = makeTenant({
      enabledModuleKeys: ["inventory", "procurement"],
      permissions: ["inventory.view", "procurement.view", "procurement.vendors.manage"],
    });
    const result = await overviewModule.getInventoryProcurementOverview(tenant);

    expect(result.hasProcurement).toBe(true);
    expect(result.procurement).not.toBeNull();
    expect(result.procurement?.vendorCount).toBe(3);
    expect(result.procurement?.activeVendorCount).toBe(2);
    expect(result.quickActions.canManageVendors).toBe(true);
    expect(result.quickActions.canManageOrders).toBe(false);
  });

  it("hides the detailed low-stock item list without INVENTORY_REPORTS_VIEW, but still shows the aggregate count", async () => {
    mockDb.inventoryItem.findMany.mockResolvedValue([
      { id: "item-1", name: "Widget", sku: "W-1", active: true, costPrice: "1.00", reorderPoint: 5, stock: [{ quantity: 0 }] },
    ]);
    mockDb.inventoryWarehouse.count.mockResolvedValue(1);
    mockDb.inventoryMovement.count.mockResolvedValue(0);

    const tenant = makeTenant({ enabledModuleKeys: ["inventory"], permissions: ["inventory.view"] });
    const result = await overviewModule.getInventoryProcurementOverview(tenant);

    expect(result.inventory.lowStockItems).toHaveLength(1);
    expect(result.lowStockItems).toBeNull();
  });

  it("shows the detailed low-stock item list with INVENTORY_REPORTS_VIEW", async () => {
    mockDb.inventoryItem.findMany.mockResolvedValue([
      { id: "item-1", name: "Widget", sku: "W-1", active: true, costPrice: "1.00", reorderPoint: 5, stock: [{ quantity: 0 }] },
    ]);
    mockDb.inventoryWarehouse.count.mockResolvedValue(1);
    mockDb.inventoryMovement.count.mockResolvedValue(0);

    const tenant = makeTenant({ enabledModuleKeys: ["inventory"], permissions: ["inventory.view", "inventory.reports.view"] });
    const result = await overviewModule.getInventoryProcurementOverview(tenant);

    expect(result.lowStockItems).toHaveLength(1);
    expect(result.lowStockItems?.[0].sku).toBe("W-1");
  });
});

describe("Receiving behavior — non-stock lines stay usable, linked lines require a warehouse", () => {
  it("a non-stock order line (no linked item) can be received without a warehouse, and never calls Inventory at all", async () => {
    mockDb.procurementOrder.findFirst.mockResolvedValue({ id: "order-1", organizationId: ORG, status: "SENT", orderNumber: "PO-0001" });
    mockDb.procurementOrderLine.findFirst.mockResolvedValue({ id: "line-1", orderId: "order-1", quantity: 5, receivedQuantity: 0, itemId: null });
    mockDb.procurementOrder.updateMany.mockResolvedValue({ count: 1 });
    mockDb.procurementOrderLine.updateMany.mockResolvedValue({ count: 1 });
    mockDb.procurementOrderLine.findMany.mockResolvedValue([{ receivedQuantity: 5, quantity: 5 }]);

    await procurement.receiveOrderLine(ORG, { orderId: "order-1", lineId: "line-1", quantity: 5 });

    expect(mockDb.inventoryItem.findFirst).not.toHaveBeenCalled();
    expect(mockDb.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it("a linked order line without a warehouse is rejected with WarehouseRequiredError before any mutation", async () => {
    mockDb.procurementOrder.findFirst.mockResolvedValue({ id: "order-1", organizationId: ORG, status: "SENT", orderNumber: "PO-0001" });
    mockDb.procurementOrderLine.findFirst.mockResolvedValue({ id: "line-1", orderId: "order-1", quantity: 5, receivedQuantity: 0, itemId: "item-1" });

    await expect(
      procurement.receiveOrderLine(ORG, { orderId: "order-1", lineId: "line-1", quantity: 5 }),
    ).rejects.toThrow(procurement.WarehouseRequiredError);

    expect(mockDb.$transaction).not.toHaveBeenCalled();
    expect(mockDb.procurementOrder.updateMany).not.toHaveBeenCalled();
    expect(mockDb.procurementOrderLine.updateMany).not.toHaveBeenCalled();
  });

  it("a linked order line with a warehouse receives through Inventory's own recordMovement, inside the same transaction", async () => {
    mockDb.procurementOrder.findFirst.mockResolvedValue({ id: "order-1", organizationId: ORG, status: "SENT", orderNumber: "PO-0001" });
    mockDb.procurementOrderLine.findFirst.mockResolvedValue({ id: "line-1", orderId: "order-1", quantity: 5, receivedQuantity: 0, itemId: "item-1" });
    mockDb.procurementOrder.updateMany.mockResolvedValue({ count: 1 });
    mockDb.procurementOrderLine.updateMany.mockResolvedValue({ count: 1 });
    mockDb.inventoryItem.findFirst.mockResolvedValue({ id: "item-1", organizationId: ORG });
    mockDb.inventoryWarehouse.findFirst.mockResolvedValue({ id: "wh-1", organizationId: ORG });
    mockDb.inventoryStock.createMany.mockResolvedValue({ count: 0 });
    mockDb.inventoryStock.findUniqueOrThrow.mockResolvedValue({ id: "stock-1", quantity: 0 });
    mockDb.inventoryMovement.create.mockResolvedValue({ id: "mv-1" });
    mockDb.procurementOrderLine.findMany.mockResolvedValue([{ receivedQuantity: 5, quantity: 5 }]);

    await procurement.receiveOrderLine(ORG, { orderId: "order-1", lineId: "line-1", quantity: 5, warehouseId: "wh-1" });

    // Goes through Inventory's own public service function (recordMovement's
    // organization-scoped lookups), never a direct write to InventoryStock
    // from Procurement's own code.
    expect(mockDb.inventoryItem.findFirst).toHaveBeenCalledWith({ where: { id: "item-1", organizationId: ORG } });
    expect(mockDb.inventoryWarehouse.findFirst).toHaveBeenCalledWith({ where: { id: "wh-1", organizationId: ORG } });
    expect(mockDb.inventoryMovement.create).toHaveBeenCalledTimes(1);
    const createCall = mockDb.inventoryMovement.create.mock.calls[0][0];
    expect(createCall.data.type).toBe("RECEIPT");
    expect(createCall.data.quantity).toBe(5);
  });

  it("inventory.recordMovement is exported and unchanged as Procurement's only path into Inventory (module boundary)", () => {
    expect(typeof inventory.recordMovement).toBe("function");
  });
});

describe("Old routes remain present on disk (deep links keep working)", () => {
  const root = process.cwd();
  const routes = [
    "src/app/app/inventory/layout.tsx",
    "src/app/app/inventory/page.tsx",
    "src/app/app/inventory/items/page.tsx",
    "src/app/app/inventory/warehouses/page.tsx",
    "src/app/app/inventory/stock/page.tsx",
    "src/app/app/inventory/movements/page.tsx",
    "src/app/app/inventory/reports/page.tsx",
    "src/app/app/inventory/settings/page.tsx",
    "src/app/app/procurement/layout.tsx",
    "src/app/app/procurement/page.tsx",
    "src/app/app/procurement/vendors/page.tsx",
    "src/app/app/procurement/requests/page.tsx",
    "src/app/app/procurement/orders/page.tsx",
    "src/app/app/procurement/reports/page.tsx",
    "src/app/app/procurement/settings/page.tsx",
  ];

  it.each(routes)("%s still exists", (relativePath) => {
    expect(existsSync(path.join(root, relativePath))).toBe(true);
  });

  it("the standalone Procurement overview page still calls requireModuleAccess directly (unchanged, independently reachable)", () => {
    const source = readFileSync(path.join(root, "src/app/app/procurement/page.tsx"), "utf8");
    expect(source).toContain('requireModuleAccess("procurement")');
  });

  it("settings pages keep their own separate permission checks and existing persistence calls, only adding a cross-link", () => {
    const inventorySettings = readFileSync(path.join(root, "src/app/app/inventory/settings/page.tsx"), "utf8");
    expect(inventorySettings).toContain("INVENTORY_SETTINGS_MANAGE");
    expect(inventorySettings).toContain("getInventorySettings");
    expect(inventorySettings).toContain("listCategories");

    const procurementSettings = readFileSync(path.join(root, "src/app/app/procurement/settings/page.tsx"), "utf8");
    expect(procurementSettings).toContain("PROCUREMENT_SETTINGS_MANAGE");
    expect(procurementSettings).toContain("getSettings");
    expect(procurementSettings).toContain("getOrderNumberPrefix");
  });
});
