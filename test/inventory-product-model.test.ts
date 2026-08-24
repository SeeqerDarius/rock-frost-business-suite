import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

const mockDb = {
  inventoryCategory: { findFirst: vi.fn() },
  inventoryItem: { create: vi.fn(), update: vi.fn() },
};

const mockListTaxCodes = vi.fn();

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/modules/accounting/tax-service", () => ({ listTaxCodes: mockListTaxCodes }));

const inventory = await import("@/modules/inventory/service");
const ORG = "org-1";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Inventory item product model", () => {
  it("rejects a tax code that does not belong to the organization, without querying AccountingTaxCode directly", async () => {
    mockListTaxCodes.mockResolvedValue([{ id: "tax-other-org" }]);

    await expect(
      inventory.createItem(ORG, { sku: "SKU-1", name: "Widget", costPrice: "10.00", taxCodeId: "tax-not-mine" }),
    ).rejects.toThrow(inventory.NotFoundError);

    expect(mockListTaxCodes).toHaveBeenCalledWith(ORG);
    expect(mockDb.inventoryItem.create).not.toHaveBeenCalled();
  });

  it("accepts a tax code that belongs to the organization", async () => {
    mockListTaxCodes.mockResolvedValue([{ id: "tax-1" }]);
    mockDb.inventoryItem.create.mockResolvedValue({ id: "item-1" });

    await inventory.createItem(ORG, { sku: "SKU-1", name: "Widget", costPrice: "10.00", taxCodeId: "tax-1" });

    expect(mockDb.inventoryItem.create).toHaveBeenCalledWith({ data: expect.objectContaining({ organizationId: ORG, taxCodeId: "tax-1" }) });
  });

  it("does not look up a tax code at all when none is given", async () => {
    mockDb.inventoryItem.create.mockResolvedValue({ id: "item-1" });

    await inventory.createItem(ORG, { sku: "SKU-1", name: "Widget", costPrice: "10.00" });

    expect(mockListTaxCodes).not.toHaveBeenCalled();
  });

  it("validates the tax code on update the same way as on create", async () => {
    mockListTaxCodes.mockResolvedValue([]);

    await expect(
      inventory.updateItem(ORG, "item-1", { sku: "SKU-1", name: "Widget", costPrice: "10.00", taxCodeId: "tax-missing" }),
    ).rejects.toThrow(inventory.NotFoundError);
    expect(mockDb.inventoryItem.update).not.toHaveBeenCalled();
  });
});

describe("Inventory item form: Type & availability, Pricing & tax sections", () => {
  it("renders the new sections and reuses Accounting's public listTaxCodes for the tax picker", () => {
    const page = read("src/app/app/inventory/items/page.tsx");
    expect(page).toContain("Type &amp; availability");
    expect(page).toContain("Pricing &amp; tax");
    expect(page).toContain('name="productType"');
    expect(page).toContain('name="trackInventory"');
    expect(page).toContain('name="isPosAvailable"');
    expect(page).toContain('name="isPurchasable"');
    expect(page).toContain('name="salesPrice"');
    expect(page).toContain('name="taxCodeId"');
    expect(page).toContain('from "@/modules/accounting/tax-service"');
    expect(page).toContain("listTaxCodes(tenant.organizationId)");
  });

  it("widens the EntityDialog for the longer form without changing its default size for other callers", () => {
    const page = read("src/app/app/inventory/items/page.tsx");
    expect(page).toContain('contentClassName="sm:max-w-xl"');

    const dialog = read("src/components/forms/entity-dialog.tsx");
    expect(dialog).toContain("contentClassName?: string");
    expect(dialog).toContain('cn("sm:max-w-lg", contentClassName)');
  });

  it("validates and persists the new fields in upsertItem", () => {
    const actions = read("src/app/app/inventory/items/actions.ts");
    expect(actions).toContain("salesPrice: moneyAmount");
    expect(actions).toContain("taxCodeId: cuid.nullable()");
    expect(actions).toContain('productType: z.enum(["GOODS", "SERVICE"])');
    expect(actions).toContain('trackInventory: formData.get("trackInventory") === "on"');
    expect(actions).toContain('isPosAvailable: formData.get("isPosAvailable") === "on"');
    expect(actions).toContain('isPurchasable: formData.get("isPurchasable") === "on"');
  });
});
