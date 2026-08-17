import "server-only";

import { db } from "@/lib/db";
import type { OfflineDeviceContext } from "@/lib/offline-sync/auth";
import type { OfflineSnapshotBuilderResult, OfflineSnapshotRow } from "@/lib/offline-sync/snapshot-builders/types";

export async function buildPosSnapshot(context: OfflineDeviceContext): Promise<OfflineSnapshotBuilderResult> {
  const organizationId = context.device.organizationId;

  const sessions = await db.posSession.findMany({
    where: { organizationId, status: "OPEN", openedById: context.device.userId },
    select: { id: true, registerId: true, openedAt: true, openingFloat: true, register: { select: { name: true, warehouseId: true } } },
    orderBy: { openedAt: "desc" },
    take: 10,
  });

  const rows: OfflineSnapshotRow[] = [];
  for (const session of sessions) {
    // PosSession has no updatedAt column: version 0, same convention as any other undated reference model.
    const { id, ...payload } = session;
    rows.push({ entityType: "pos.session", entityId: id, version: 0, payload });
  }

  // Original nested-blob response never bounded or tracked truncation for
  // sessions (fixed take: 10, no truncated flag contribution) - preserved.
  return { rows, truncated: false };
}
