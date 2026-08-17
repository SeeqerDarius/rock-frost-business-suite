import "server-only";

import { db } from "@/lib/db";
import type { OfflineDeviceContext } from "@/lib/offline-sync/auth";
import { OFFLINE_SYNC_LIMITS } from "@/lib/offline-sync/contract";
import { versionOf, type OfflineSnapshotBuilderResult, type OfflineSnapshotRow } from "@/lib/offline-sync/snapshot-builders/types";

/** Built whenever either "inventory" or "pos" is authorized: POS needs warehouse/stock visibility even without inventory management access, exactly as the original combined nested-blob block did. */
export async function buildInventorySnapshot(
  context: OfflineDeviceContext,
  authorizedModuleKeys: readonly string[],
): Promise<OfflineSnapshotBuilderResult> {
  const organizationId = context.device.organizationId;
  const take = OFFLINE_SYNC_LIMITS.snapshotRowsPerCollection;
  const canManageInventory = authorizedModuleKeys.includes("inventory");

  const posWarehouseIds = canManageInventory
    ? null
    : (
        await db.posSession.findMany({
          where: { organizationId, status: "OPEN", openedById: context.device.userId, register: { warehouseId: { not: null } } },
          select: { register: { select: { warehouseId: true } } },
        })
      ).flatMap(({ register }) => (register.warehouseId ? [register.warehouseId] : []));
  const warehouseWhere = canManageInventory ? { organizationId } : { organizationId, id: { in: posWarehouseIds ?? [] } };

  const [items, warehouses, stock] = await Promise.all([
    canManageInventory
      ? db.inventoryItem.findMany({
          where: { organizationId, active: true },
          select: { id: true, sku: true, name: true, unit: true, costPrice: true, updatedAt: true },
          orderBy: { id: "asc" },
          take: take + 1,
        })
      : db.inventoryItem.findMany({
          where: { organizationId, active: true },
          select: { id: true, sku: true, name: true, unit: true, updatedAt: true },
          orderBy: { id: "asc" },
          take: take + 1,
        }),
    db.inventoryWarehouse.findMany({
      where: warehouseWhere,
      select: { id: true, name: true, location: true, active: true },
      orderBy: { id: "asc" },
      take: take + 1,
    }),
    db.inventoryStock.findMany({
      where: { item: { organizationId }, warehouse: warehouseWhere },
      select: { id: true, itemId: true, warehouseId: true, quantity: true, updatedAt: true },
      orderBy: { id: "asc" },
      take: take + 1,
    }),
  ]);

  const truncated = items.length > take || warehouses.length > take || stock.length > take;
  const rows: OfflineSnapshotRow[] = [];

  for (const { id, updatedAt, ...payload } of items.slice(0, take)) {
    rows.push({ entityType: "inventory.item", entityId: id, version: versionOf(updatedAt), payload });
  }
  for (const warehouse of warehouses.slice(0, take)) {
    // InventoryWarehouse has no updatedAt column: version 0, same convention as any other undated reference model.
    const { id, ...payload } = warehouse;
    rows.push({ entityType: "inventory.warehouse", entityId: id, version: 0, payload });
  }
  for (const { id, updatedAt, ...payload } of stock.slice(0, take)) {
    rows.push({ entityType: "inventory.stock", entityId: id, version: versionOf(updatedAt), payload });
  }

  return { rows, truncated };
}
