import "server-only";

import { db } from "@/lib/db";

/** Organizations carrying an active system Super Admin are internal platform anchors, not customer tenants. */
export async function getPlatformAnchorOrganizationIds(): Promise<string[]> {
  const memberships = await db.organizationMember.findMany({
    where: {
      status: "ACTIVE",
      role: { name: "Super Admin", isSystem: true, organizationId: null },
    },
    select: { organizationId: true },
    distinct: ["organizationId"],
  });
  return memberships.map(({ organizationId }) => organizationId);
}

export async function isPlatformAnchorOrganization(organizationId: string): Promise<boolean> {
  return Boolean(await db.organizationMember.findFirst({
    where: {
      organizationId,
      status: "ACTIVE",
      role: { name: "Super Admin", isSystem: true, organizationId: null },
    },
    select: { id: true },
  }));
}
