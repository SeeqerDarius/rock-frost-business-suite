import "server-only";

import { db } from "@/lib/db";
import { resolveInstallmentAccessScope } from "@/modules/installment/access";
import type { OfflineDeviceContext } from "@/lib/offline-sync/auth";
import { OFFLINE_SYNC_LIMITS } from "@/lib/offline-sync/contract";
import { versionOf, type OfflineSnapshotBuilderResult, type OfflineSnapshotRow } from "@/lib/offline-sync/snapshot-builders/types";

export async function buildInstallmentSnapshot(context: OfflineDeviceContext): Promise<OfflineSnapshotBuilderResult> {
  const organizationId = context.device.organizationId;
  const take = OFFLINE_SYNC_LIMITS.snapshotRowsPerCollection;
  const scope = await resolveInstallmentAccessScope(context.tenant);
  const accountWhere = scope.kind === "organization" ? {} : scope.kind === "staff" ? { customer: { staffId: scope.staffId } } : { id: "__denied__" };

  const accounts = await db.hirePurchaseAccount.findMany({
    where: { organizationId, ...accountWhere },
    select: {
      id: true,
      customerId: true,
      productId: true,
      balance: true,
      totalPaid: true,
      status: true,
      updatedAt: true,
      customer: { select: { customerCode: true, fullName: true, phone: true } },
    },
    orderBy: { id: "asc" },
    take: take + 1,
  });

  const truncated = accounts.length > take;
  const rows: OfflineSnapshotRow[] = [];
  for (const { id, updatedAt, ...payload } of accounts.slice(0, take)) {
    rows.push({ entityType: "installment.account", entityId: id, version: versionOf(updatedAt), payload });
  }

  return { rows, truncated };
}
