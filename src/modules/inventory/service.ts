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

async function getOrCreateStockRow(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  itemId: string,
  warehouseId: string,
) {
  const existing = await tx.inventoryStock.findUnique({ where: { itemId_warehouseId: { itemId, warehouseId } } });
  if (existing) return existing;
  return tx.inventoryStock.create({ data: { itemId, warehouseId, quantity: 0 } });
}

// --- Movements ---

export class InsufficientStockError extends Error {}
export class InvalidTransferError extends Error {}

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

export async function recordMovement(organizationId: string, input: MovementInput) {
  const item = await db.inventoryItem.findFirst({ where: { id: input.itemId, organizationId } });
  if (!item) throw new Error("Item not found.");

  if (input.type === "TRANSFER") {
    if (!input.toWarehouseId) throw new InvalidTransferError("A destination warehouse is required for transfers.");
    if (input.toWarehouseId === input.warehouseId) {
      throw new InvalidTransferError("Source and destination warehouses must be different.");
    }
  }

  return db.$transaction(async (tx) => {
    const source = await getOrCreateStockRow(tx, input.itemId, input.warehouseId);

    if (input.type === "RECEIPT") {
      await tx.inventoryStock.update({ where: { id: source.id }, data: { quantity: source.quantity + input.quantity } });
    } else if (input.type === "ISSUE") {
      if (source.quantity < input.quantity) throw new InsufficientStockError("Not enough stock at this warehouse to issue that quantity.");
      await tx.inventoryStock.update({ where: { id: source.id }, data: { quantity: source.quantity - input.quantity } });
    } else if (input.type === "ADJUSTMENT") {
      const nextQuantity = source.quantity + input.quantity;
      if (nextQuantity < 0) throw new InsufficientStockError("Adjustment would result in negative stock.");
      await tx.inventoryStock.update({ where: { id: source.id }, data: { quantity: nextQuantity } });
    } else if (input.type === "TRANSFER") {
      if (source.quantity < input.quantity) throw new InsufficientStockError("Not enough stock at the source warehouse to transfer that quantity.");
      const destination = await getOrCreateStockRow(tx, input.itemId, input.toWarehouseId!);
      await tx.inventoryStock.update({ where: { id: source.id }, data: { quantity: source.quantity - input.quantity } });
      await tx.inventoryStock.update({ where: { id: destination.id }, data: { quantity: destination.quantity + input.quantity } });
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
  });
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
