import "server-only";

import { db } from "@/lib/db";
import type { InventoryMovementType, InventoryProductType } from "@prisma/client";
import {
  getOrganizationModuleConfiguration,
  updateOrganizationModuleConfigurationValues,
} from "@/platform/module-requests/configuration";
import { listTaxCodes } from "@/modules/accounting/tax-service";

/**
 * Fresh module (no reference implementation to migrate from). Every function
 * takes organizationId explicitly and filters on it, per docs/MODULE_BOUNDARIES.md.
 */

/** Inventory has no dedicated settings table; the default reorder point
 * lives in the generic `OrganizationModule.configuration` store. */
export async function getInventorySettings(organizationId: string) {
  const configuration = await getOrganizationModuleConfiguration(organizationId, "inventory");
  const configured = configuration.limits.defaultReorderPoint;
  return { defaultReorderPoint: Number.isFinite(configured) && configured >= 0 ? Math.round(configured) : 0 };
}

export async function updateInventorySettings(organizationId: string, data: { defaultReorderPoint: number }, actorId?: string | null) {
  await updateOrganizationModuleConfigurationValues(organizationId, "inventory", { limits: { defaultReorderPoint: data.defaultReorderPoint } }, actorId);
}

// --- Categories ---

export function listCategories(organizationId: string) {
  return db.inventoryCategory.findMany({ where: { organizationId }, orderBy: { name: "asc" } });
}

export function createCategory(organizationId: string, name: string) {
  return db.inventoryCategory.create({ data: { organizationId, name } });
}

// --- Warehouses ---

export function listWarehouses(organizationId: string) {
  return db.inventoryWarehouse.findMany({ where: { organizationId }, include: { branch: true }, orderBy: { name: "asc" } });
}

interface WarehouseInput {
  name: string;
  location?: string | null;
  branchId?: string | null;
  isDefault?: boolean;
  active?: boolean;
}

async function clearOtherDefaults(organizationId: string, exceptId?: string) {
  await db.inventoryWarehouse.updateMany({
    where: { organizationId, id: exceptId ? { not: exceptId } : undefined },
    data: { isDefault: false },
  });
}

export class WarehouseNameTakenError extends Error {}

export async function createWarehouse(organizationId: string, data: WarehouseInput) {
  let warehouse;
  try {
    warehouse = await db.inventoryWarehouse.create({ data: { organizationId, ...data } });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "P2002") {
      throw new WarehouseNameTakenError(`Warehouse name "${data.name}" is already in use.`);
    }
    throw error;
  }
  if (warehouse.isDefault) await clearOtherDefaults(organizationId, warehouse.id);
  return warehouse;
}

export async function updateWarehouse(organizationId: string, id: string, data: WarehouseInput) {
  let warehouse;
  try {
    warehouse = await db.inventoryWarehouse.update({ where: { id, organizationId }, data });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "P2002") {
      throw new WarehouseNameTakenError(`Warehouse name "${data.name}" is already in use.`);
    }
    throw error;
  }
  if (warehouse.isDefault) await clearOtherDefaults(organizationId, warehouse.id);
  return warehouse;
}

// --- Items ---

export function listItems(organizationId: string) {
  return db.inventoryItem.findMany({
    where: { organizationId },
    include: { category: true, stock: { include: { warehouse: true } } },
    orderBy: { name: "asc" },
  });
}

interface ItemInput {
  sku: string;
  barcode?: string | null;
  name: string;
  imageData?: string | null;
  categoryId?: string | null;
  unit?: string;
  costPrice: string;
  salesPrice?: string;
  taxCodeId?: string | null;
  productType?: InventoryProductType;
  trackInventory?: boolean;
  isPosAvailable?: boolean;
  isPurchasable?: boolean;
  tags?: string[];
  reorderPoint?: number;
  active?: boolean;
}

export class ItemSkuTakenError extends Error {}
export class ItemBarcodeTakenError extends Error {}

async function requireCategory(organizationId: string, categoryId: string) {
  const category = await db.inventoryCategory.findFirst({ where: { id: categoryId, organizationId } });
  if (!category) throw new NotFoundError("Category not found.");
}

/** Reuses Accounting's already-public, already-auto-seeding listTaxCodes() rather than
 * querying AccountingTaxCode directly, per docs/MODULE_BOUNDARIES.md. Only checks the
 * code belongs to this org - not whether it's effective today, since an item's default
 * tax is a catalog setting, not a dated transaction (effective-dating is enforced at
 * sale/posting time by Accounting's own calculateTax()). */
async function requireTaxCode(organizationId: string, taxCodeId: string) {
  const taxCodes = await listTaxCodes(organizationId);
  if (!taxCodes.some((code) => code.id === taxCodeId)) throw new NotFoundError("Tax code not found.");
}

export async function createItem(organizationId: string, data: ItemInput) {
  if (data.categoryId) await requireCategory(organizationId, data.categoryId);
  if (data.taxCodeId) await requireTaxCode(organizationId, data.taxCodeId);
  try {
    return await db.inventoryItem.create({ data: { organizationId, ...data } });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "P2002") {
      const target = (error as { meta?: { target?: string[] } }).meta?.target;
      if (target?.includes("barcode")) throw new ItemBarcodeTakenError("Barcode is already in use.");
      throw new ItemSkuTakenError(`SKU "${data.sku}" is already in use.`);
    }
    throw error;
  }
}

export async function updateItem(organizationId: string, id: string, data: ItemInput) {
  if (data.categoryId) await requireCategory(organizationId, data.categoryId);
  if (data.taxCodeId) await requireTaxCode(organizationId, data.taxCodeId);
  try {
    return await db.inventoryItem.update({ where: { id, organizationId }, data });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "P2002") {
      const target = (error as { meta?: { target?: string[] } }).meta?.target;
      if (target?.includes("barcode")) throw new ItemBarcodeTakenError("Barcode is already in use.");
      throw new ItemSkuTakenError(`SKU "${data.sku}" is already in use.`);
    }
    throw error;
  }
}

export function getItemImage(organizationId: string, id: string) {
  return db.inventoryItem.findFirst({ where: { id, organizationId }, select: { imageData: true, updatedAt: true } });
}

export function findItemByBarcode(organizationId: string, barcode: string) {
  return db.inventoryItem.findFirst({
    where: { organizationId, barcode, active: true },
    include: { category: true, stock: { include: { warehouse: true } } },
  });
}

// --- Stock ---

export function getStockGrid(organizationId: string) {
  return db.inventoryStock.findMany({
    where: { item: { organizationId } },
    include: { item: { include: { category: true } }, warehouse: true },
    orderBy: [{ item: { name: "asc" } }, { warehouse: { name: "asc" } }],
  });
}

export type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

/**
 * Atomic get-or-create: upsert with a no-op update on conflict avoids the
 * race a plain findUnique-then-create has under concurrent first-time
 * movements against the same item/warehouse (both would see "no row" and
 * both attempt create, one throwing a unique-constraint error instead of
 * quietly succeeding).
 */
async function getOrCreateStockRow(tx: Tx, itemId: string, warehouseId: string) {
  await tx.inventoryStock.createMany({
    data: [{ itemId, warehouseId, quantity: 0 }],
    skipDuplicates: true,
  });
  return tx.inventoryStock.findUniqueOrThrow({
    where: { itemId_warehouseId: { itemId, warehouseId } },
  });
}

/**
 * Atomic guarded decrement: a single UPDATE with the sufficiency check in
 * its WHERE clause, not a separate read-then-write. Under Postgres's default
 * READ COMMITTED isolation, a concurrent UPDATE blocked on the same row's
 * lock re-evaluates its WHERE clause against the just-committed row once
 * unblocked (EvalPlanQual) — so two concurrent issues against the same
 * stock row can never both pass the guard and oversell, the way the
 * previous read-then-absolute-write pattern could.
 */
async function decrementGuarded(tx: Tx, stockId: string, quantity: number) {
  const result = await tx.inventoryStock.updateMany({
    where: { id: stockId, quantity: { gte: quantity } },
    data: { quantity: { decrement: quantity } },
  });
  return result.count > 0;
}

// --- Movements ---

export class InsufficientStockError extends Error {}
export class InvalidTransferError extends Error {}
export class NotFoundError extends Error {}

interface MovementInput {
  itemId: string;
  warehouseId: string;
  type: InventoryMovementType;
  quantity: number;
  toWarehouseId?: string | null;
  reference?: string | null;
  notes?: string | null;
  createdById?: string | null;
  occurredAt?: Date;
}

async function recordMovementInTx(tx: Tx, organizationId: string, input: MovementInput) {
  const source = await getOrCreateStockRow(tx, input.itemId, input.warehouseId);

  if (input.type === "RECEIPT") {
    await tx.inventoryStock.update({ where: { id: source.id }, data: { quantity: { increment: input.quantity } } });
  } else if (input.type === "ISSUE") {
    const ok = await decrementGuarded(tx, source.id, input.quantity);
    if (!ok) throw new InsufficientStockError("Not enough stock at this warehouse to issue that quantity.");
  } else if (input.type === "ADJUSTMENT") {
    if (input.quantity > 0) {
      await tx.inventoryStock.update({ where: { id: source.id }, data: { quantity: { increment: input.quantity } } });
    } else {
      const ok = await decrementGuarded(tx, source.id, -input.quantity);
      if (!ok) throw new InsufficientStockError("Adjustment would result in negative stock.");
    }
  } else if (input.type === "TRANSFER") {
    const ok = await decrementGuarded(tx, source.id, input.quantity);
    if (!ok) throw new InsufficientStockError("Not enough stock at the source warehouse to transfer that quantity.");
    const destination = await getOrCreateStockRow(tx, input.itemId, input.toWarehouseId!);
    await tx.inventoryStock.update({ where: { id: destination.id }, data: { quantity: { increment: input.quantity } } });
  }

  return tx.inventoryMovement.create({
    data: {
      organizationId,
      itemId: input.itemId,
      warehouseId: input.warehouseId,
      toWarehouseId: input.type === "TRANSFER" ? input.toWarehouseId : null,
      type: input.type,
      quantity: input.quantity,
      reference: input.reference,
      notes: input.notes,
      createdById: input.createdById,
      occurredAt: input.occurredAt ?? new Date(),
    },
  });
}

/**
 * Records a stock movement. Validation and the organization-scoped item/
 * warehouse lookups always run against the top-level `db` (a lookup doesn't
 * need to be inside another caller's transaction), but the actual stock
 * mutation + audit row can optionally run inside a transaction a caller
 * already holds open (`tx`) — this is what lets POS's createSale()/
 * refundSale() commit a sale and every line's stock movement as one
 * all-or-nothing unit, while still going through Inventory's own public
 * service function rather than touching InventoryStock directly (see
 * docs/MODULE_BOUNDARIES.md). Omit `tx` for a standalone call, which opens
 * its own transaction exactly as before.
 */
export async function recordMovement(organizationId: string, input: MovementInput, tx?: Tx) {
  if (!Number.isInteger(input.quantity) || input.quantity === 0) {
    throw new Error("Quantity must be a non-zero whole number.");
  }
  if (input.type !== "ADJUSTMENT" && input.quantity < 0) {
    throw new Error("Quantity must be positive for this movement type.");
  }

  const item = await db.inventoryItem.findFirst({ where: { id: input.itemId, organizationId } });
  if (!item) throw new NotFoundError("Item not found.");

  const warehouse = await db.inventoryWarehouse.findFirst({ where: { id: input.warehouseId, organizationId } });
  if (!warehouse) throw new NotFoundError("Warehouse not found.");

  if (input.type === "TRANSFER") {
    if (!input.toWarehouseId) throw new InvalidTransferError("A destination warehouse is required for transfers.");
    if (input.toWarehouseId === input.warehouseId) {
      throw new InvalidTransferError("Source and destination warehouses must be different.");
    }
    const destinationWarehouse = await db.inventoryWarehouse.findFirst({
      where: { id: input.toWarehouseId, organizationId },
    });
    if (!destinationWarehouse) throw new NotFoundError("Destination warehouse not found.");
  }

  if (tx) return recordMovementInTx(tx, organizationId, input);
  return db.$transaction((innerTx) => recordMovementInTx(innerTx, organizationId, input));
}

export function listMovements(organizationId: string) {
  return db.inventoryMovement.findMany({
    where: { organizationId },
    include: { item: true, warehouse: true, toWarehouse: true, createdBy: true },
    orderBy: { occurredAt: "desc" },
    take: 200,
  });
}

// --- Stock counts ---

export class InventoryCountStateError extends Error {}
export class InventoryCountApprovalError extends Error {}

export function listInventoryCounts(organizationId: string) {
  return db.inventoryCount.findMany({
    where: { organizationId },
    include: { warehouse: true, lines: { include: { item: true }, orderBy: { item: { name: "asc" } } } },
    orderBy: [{ countDate: "desc" }, { createdAt: "desc" }],
    take: 100,
  });
}

export async function createInventoryCount(
  organizationId: string,
  input: { warehouseId: string; countDate: Date; notes?: string | null; createdById?: string | null },
) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${organizationId}:inventory-count-number`}))`;
    const warehouse = await tx.inventoryWarehouse.findFirst({ where: { id: input.warehouseId, organizationId, active: true } });
    if (!warehouse) throw new NotFoundError("Warehouse not found.");
    const items = await tx.inventoryItem.findMany({
      where: { organizationId, active: true, trackInventory: true },
      include: { stock: { where: { warehouseId: input.warehouseId } } },
      orderBy: { name: "asc" },
    });
    if (items.length === 0) throw new InventoryCountStateError("Add an active inventory item before starting a stock count.");
    const sequence = await tx.inventoryCount.count({ where: { organizationId } });
    return tx.inventoryCount.create({
      data: {
        organizationId,
        warehouseId: input.warehouseId,
        countDate: input.countDate,
        notes: input.notes,
        createdById: input.createdById,
        countNumber: `CNT-${String(sequence + 1).padStart(6, "0")}`,
        lines: {
          create: items.map((item) => ({ itemId: item.id, expectedQuantity: item.stock[0]?.quantity ?? 0 })),
        },
      },
      include: { lines: true },
    });
  });
}

export async function updateInventoryCountLine(
  organizationId: string,
  countId: string,
  lineId: string,
  countedQuantity: number,
  notes?: string | null,
) {
  if (!Number.isInteger(countedQuantity) || countedQuantity < 0) throw new Error("Counted quantity must be a non-negative whole number.");
  const line = await db.inventoryCountLine.findFirst({
    where: { id: lineId, countId, count: { organizationId, status: "DRAFT" } },
  });
  if (!line) throw new InventoryCountStateError("Draft count line not found.");
  return db.inventoryCountLine.update({
    where: { id: line.id },
    data: { countedQuantity, variance: countedQuantity - line.expectedQuantity, notes },
  });
}

export async function submitInventoryCount(organizationId: string, countId: string) {
  const count = await db.inventoryCount.findFirst({ where: { id: countId, organizationId, status: "DRAFT" }, include: { lines: true } });
  if (!count || count.lines.length === 0 || count.lines.some((line) => line.countedQuantity === null)) {
    throw new InventoryCountStateError("Every line must be counted before submission.");
  }
  const claimed = await db.inventoryCount.updateMany({ where: { id: count.id, organizationId, status: "DRAFT" }, data: { status: "SUBMITTED", submittedAt: new Date() } });
  if (claimed.count === 0) throw new InventoryCountStateError("This stock count is no longer a draft.");
  return db.inventoryCount.findFirstOrThrow({ where: { id: count.id, organizationId } });
}

export async function reviewInventoryCount(
  organizationId: string,
  countId: string,
  input: { decision: "APPROVE" | "REJECT"; actorId: string; reason?: string | null },
) {
  const count = await db.inventoryCount.findFirst({ where: { id: countId, organizationId, status: "SUBMITTED" } });
  if (!count) throw new InventoryCountStateError("Submitted stock count not found.");
  if (count.createdById === input.actorId) throw new InventoryCountApprovalError("The count creator cannot approve or reject the same count.");
  if (input.decision === "REJECT" && !input.reason?.trim()) throw new InventoryCountApprovalError("A rejection reason is required.");
  const claimed = await db.inventoryCount.updateMany({
    where: { id: count.id, organizationId, status: "SUBMITTED" },
    data: input.decision === "APPROVE"
      ? { status: "APPROVED", approvedById: input.actorId, approvedAt: new Date() }
      : { status: "REJECTED", rejectedById: input.actorId, rejectedAt: new Date(), rejectionReason: input.reason },
  });
  if (claimed.count === 0) throw new InventoryCountStateError("This stock count was already reviewed.");
  return db.inventoryCount.findFirstOrThrow({ where: { id: count.id, organizationId } });
}

export async function postInventoryCount(organizationId: string, countId: string, actorId: string) {
  return db.$transaction(async (tx) => {
    const count = await tx.inventoryCount.findFirst({
      where: { id: countId, organizationId, status: "APPROVED" },
      include: { lines: true },
    });
    if (!count) throw new InventoryCountStateError("Approved stock count not found.");
    const claimed = await tx.inventoryCount.updateMany({
      where: { id: count.id, organizationId, status: "APPROVED" },
      data: { status: "POSTED", postedById: actorId, postedAt: new Date() },
    });
    if (claimed.count === 0) throw new InventoryCountStateError("This stock count was already posted.");

    for (const line of count.lines) {
      if (line.countedQuantity === null) throw new InventoryCountStateError("A count line has no counted quantity.");
      await tx.inventoryStock.createMany({ data: [{ itemId: line.itemId, warehouseId: count.warehouseId, quantity: 0 }], skipDuplicates: true });
      const rows = await tx.$queryRaw<{ id: string; quantity: number }[]>`
        SELECT "id", "quantity" FROM "InventoryStock"
        WHERE "itemId" = ${line.itemId} AND "warehouseId" = ${count.warehouseId}
        FOR UPDATE
      `;
      const current = rows[0];
      if (!current) throw new InventoryCountStateError("Inventory stock row could not be locked.");
      const adjustment = line.countedQuantity - current.quantity;
      if (adjustment !== 0) {
        await recordMovementInTx(tx, organizationId, {
          itemId: line.itemId,
          warehouseId: count.warehouseId,
          type: "ADJUSTMENT",
          quantity: adjustment,
          reference: count.countNumber,
          notes: `Posted physical count ${count.countNumber}`,
          createdById: actorId,
          occurredAt: count.countDate,
        });
      }
    }
    return tx.inventoryCount.findFirstOrThrow({ where: { id: count.id, organizationId }, include: { lines: true } });
  });
}

// --- Reports ---

export async function getInventorySummary(organizationId: string) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const items = await db.inventoryItem.findMany({ where: { organizationId }, include: { stock: true } });

  let totalStockValue = 0;
  const lowStockItems: { id: string; name: string; sku: string; totalQuantity: number; reorderPoint: number }[] = [];

  for (const item of items) {
    const totalQuantity = item.stock.reduce((sum, s) => sum + s.quantity, 0);
    totalStockValue += totalQuantity * Number(item.costPrice);
    if (totalQuantity <= item.reorderPoint) {
      lowStockItems.push({ id: item.id, name: item.name, sku: item.sku, totalQuantity, reorderPoint: item.reorderPoint });
    }
  }

  const [warehouseCount, movementsThisMonth] = await Promise.all([
    db.inventoryWarehouse.count({ where: { organizationId } }),
    db.inventoryMovement.count({ where: { organizationId, occurredAt: { gte: monthStart } } }),
  ]);

  return {
    itemCount: items.length,
    activeItemCount: items.filter((i) => i.active).length,
    warehouseCount,
    totalStockValue,
    lowStockItems: lowStockItems.sort((a, b) => a.totalQuantity - b.totalQuantity),
    movementsThisMonth,
  };
}
