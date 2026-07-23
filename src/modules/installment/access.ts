import "server-only";

import { db } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import type { TenantContext } from "@/lib/tenant";

/**
 * The data boundary for customer-owned Installment records.
 *
 * `denied` is deliberately explicit: callers cannot accidentally turn a
 * missing staff link into an unscoped organization query.
 */
export type InstallmentAccessScope =
  | { kind: "organization" }
  | { kind: "staff"; staffId: string }
  | { kind: "denied" };

export async function resolveInstallmentAccessScope(
  tenant: TenantContext,
): Promise<InstallmentAccessScope> {
  if (hasPermission(tenant, PERMISSIONS.HIREPURCHASE_STAFF_MANAGE)) {
    return { kind: "organization" };
  }

  if (!tenant.userId) return { kind: "denied" };

  const matches = await db.hirePurchaseStaff.findMany({
    where: {
      organizationId: tenant.organizationId,
      userId: tenant.userId,
      active: true,
    },
    select: { id: true },
    take: 2,
  });

  // The database uniqueness constraint prevents new ambiguous links; keeping
  // the two-row check also fails closed if legacy or drifted data is ever
  // encountered before a migration is applied in a new environment.
  return matches.length === 1
    ? { kind: "staff", staffId: matches[0].id }
    : { kind: "denied" };
}
