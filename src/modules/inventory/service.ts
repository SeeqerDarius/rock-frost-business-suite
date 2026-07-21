import "server-only";

import { db } from "@/lib/db";
import type { InventoryMovementType } from "@prisma/client";

/**
 * Fresh module (no reference implementation to migrate from). Every function
 * takes organizationId explicitly and filters on it, per docs/MODULE_BOUNDARIES.md.
 */

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

export async function createWarehouse(organizationId: string, data: WarehouseInput) {
  const warehouse = await db.inventoryWarehouse.create({ data: { organizationId, ...data } });
  if (warehouse.isDefault) await clearOtherDefaults(organizationId, warehouse.id);
  return warehouse;
}

export async function updateWarehouse(organizationId: string, id: string, data: WarehouseInput) {
  const warehouse = await db.inventoryWarehouse.update({ where: { id, organizationId }, data });
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
  name: string;
  categoryId?: string | null;
  unit?: string;
  costPrice: string;
  reorderPoint?: number;
  active?: boolean;
}

export class ItemSkuTakenError extends Error {}

export async function createItem(organizationId: string, data: ItemInput) {
  try {
    return await db.inventoryItem.create({ data: { organizationId, ...data } });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "P2002") {
      throw new ItemSkuTakenError(`SKU "${data.sku}" is already in use.`);
    }
    throw error;
  }
}

export async function updateItem(organizationId: string, id: string, data: ItemInput) {
  try {
    return await db.inventoryItem.update({ where: { id, organizationId }, data });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "P2002") {
      throw new ItemSkuTakenError(`SKU "${data.sku}" is already in use.`);
    }
    throw error;
  }
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
  return tx.inventoryStock.upsert({
    where: { itemId_warehouseId: { itemId, warehouseId } },
    update: {},
    create: { itemId, warehouseId, quantity: 0 },
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
