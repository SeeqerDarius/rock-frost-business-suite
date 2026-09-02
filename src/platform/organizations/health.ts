import "server-only";

import { db } from "@/lib/db";

/**
 * A platform-owner-facing snapshot of one organization's real usage and
 * error signals, built entirely from data already recorded elsewhere in
 * the app (no new tracking added). Four cheap, independent queries rather
 * than one large join, since each targets a different table with its own
 * existing index (FileAsset.organizationId, FleetPayment's
 * [organizationId, postingStatus], OfflineDevice's organizationId+status,
 * AuditLog's [organizationId, createdAt]).
 */
export interface OrganizationHealthSnapshot {
  storageBytes: number;
  lastActivityAt: Date | null;
  failedFleetPostings: number;
  activeOfflineDevices: number;
}

export async function getOrganizationHealthSnapshot(organizationId: string): Promise<OrganizationHealthSnapshot> {
  const [storage, lastActivity, failedFleetPostings, activeOfflineDevices] = await Promise.all([
    db.fileAsset.aggregate({ where: { organizationId }, _sum: { size: true } }),
    db.auditLog.findFirst({ where: { organizationId }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    db.fleetPayment.count({ where: { organizationId, postingStatus: "FAILED" } }),
    db.offlineDevice.count({ where: { organizationId, status: "ACTIVE" } }),
  ]);

  return {
    storageBytes: storage._sum.size ?? 0,
    lastActivityAt: lastActivity?.createdAt ?? null,
    failedFleetPostings,
    activeOfflineDevices,
  };
}
