import "server-only";

import type { Prisma } from "@prisma/client";
import { PLATFORM_MEMBERSHIP_ROLE_WHERE } from "@/lib/auth/platform-identity";

export const TENANT_AUDIT_ACTOR_WHERE = {
  organizationMemberships: {
    none: { role: PLATFORM_MEMBERSHIP_ROLE_WHERE },
  },
} satisfies Prisma.UserWhereInput;

/**
 * Tenant-facing audit surfaces must never expose events performed by a
 * Rock Frost platform identity, even when the event targeted this tenant and
 * therefore carries its organizationId. Platform operators retain the full
 * cross-organization trail under /app/platform/activity.
 */
export function tenantAuditWhere(organizationId: string): Prisma.AuditLogWhereInput {
  return {
    organizationId,
    OR: [
      { userId: null },
      {
        user: {
          is: TENANT_AUDIT_ACTOR_WHERE,
        },
      },
    ],
  };
}
