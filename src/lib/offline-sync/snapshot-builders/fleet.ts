import "server-only";

import { db } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import type { OfflineDeviceContext } from "@/lib/offline-sync/auth";
import { OFFLINE_SYNC_LIMITS } from "@/lib/offline-sync/contract";
import { versionOf, type OfflineSnapshotBuilderResult, type OfflineSnapshotRow } from "@/lib/offline-sync/snapshot-builders/types";

export async function buildFleetSnapshot(context: OfflineDeviceContext): Promise<OfflineSnapshotBuilderResult> {
  const organizationId = context.device.organizationId;
  const take = OFFLINE_SYNC_LIMITS.snapshotRowsPerCollection;
  const canManageFleet = hasPermission(context.tenant, PERMISSIONS.FLEET_MAINTENANCE_MANAGE);

  const [vehicles, driver, contracts] = await Promise.all([
    db.fleetVehicle.findMany({
      where: canManageFleet ? { organizationId } : { organizationId, assignedDriver: { userId: context.device.userId } },
      select: { id: true, assetTag: true, plateNumber: true, make: true, model: true, status: true, assignedDriverId: true, updatedAt: true },
      orderBy: { id: "asc" },
      take: take + 1,
    }),
    db.fleetDriver.findFirst({
      where: { organizationId, userId: context.device.userId, status: "ACTIVE" },
      select: { id: true, updatedAt: true, assignedVehicles: { select: { id: true } } },
    }),
    // Not counted toward `truncated`: the original nested-blob response
    // never tracked truncation for this collection either, only for
    // vehicles - preserved exactly, not silently strengthened here.
    db.fleetWorkAndPayContract.findMany({
      where: { organizationId, contractStatus: "ACTIVE", vehicle: { assignedDriver: { userId: context.device.userId } } },
      select: { id: true, vehicleId: true, outstandingBalance: true, weeklyPaymentAmount: true, updatedAt: true },
      take: 100,
    }),
  ]);

  const truncated = vehicles.length > take;
  const rows: OfflineSnapshotRow[] = [];

  for (const { id, updatedAt, ...payload } of vehicles.slice(0, take)) {
    rows.push({ entityType: "fleet.vehicle", entityId: id, version: versionOf(updatedAt), payload });
  }
  if (driver) {
    const { id, updatedAt, ...payload } = driver;
    rows.push({ entityType: "fleet.driver_profile", entityId: id, version: versionOf(updatedAt), payload });
  }
  for (const { id, updatedAt, ...payload } of contracts) {
    rows.push({ entityType: "fleet.work_and_pay_contract", entityId: id, version: versionOf(updatedAt), payload });
  }

  return { rows, truncated };
}
