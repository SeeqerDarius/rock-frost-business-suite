import "server-only";

import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { getServerAuthSession } from "@/lib/auth/session";

export const ACTIVE_ORG_COOKIE = "active_org";

export interface TenantContext {
  organizationId: string;
  organization: {
    id: string;
    name: string;
    tenantCode: string;
    industry: string | null;
    status: string;
  };
  role: string | null;
  roleId: string | null;
  permissions: string[];
  branch: {
    id: string;
    name: string;
    code: string;
  } | null;
  /** Module keys (Module.code) enabled for this organization — drives the module launcher and dashboard. */
  enabledModuleKeys: string[];
  /** Every organization the current user belongs to, for the organization switcher. Includes the active one. */
  memberships: { organizationId: string; name: string; tenantCode: string }[];
}

/**
 * Resolves the organization (and branch, if assigned) the current signed-in
 * user belongs to. Returns null if there is no session or no matching
 * OrganizationMember record, rather than throwing, so callers can decide how
 * to handle a user with no tenant context.
 *
 * The active organization is normally the one chosen at login
 * (session.user.organizationId), but a user who belongs to more than one
 * organization can switch via the `active_org` cookie (see
 * src/lib/tenant/actions.ts) — honored here only if a real membership for
 * that organization still exists.
 */
export async function getCurrentTenant(): Promise<TenantContext | null> {
  const session = await getServerAuthSession();
  const userId = session?.user?.id;

  if (!userId) {
    return null;
  }

  const allMemberships = await db.organizationMember.findMany({
    where: { userId },
    include: { organization: true },
    orderBy: { createdAt: "asc" },
  });

  if (allMemberships.length === 0) {
    return null;
  }

  const cookieStore = await cookies();
  const requestedOrgId = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;
  const effectiveOrgId =
    (requestedOrgId && allMemberships.some((m) => m.organizationId === requestedOrgId) && requestedOrgId) ||
    session?.user?.organizationId ||
    allMemberships[0].organizationId;

  const membership = await db.organizationMember.findFirst({
    where: { userId, organizationId: effectiveOrgId },
    include: {
      organization: true,
      branch: true,
      role: { include: { rolePermissions: { include: { permission: true } } } },
    },
  });

  if (!membership) {
    return null;
  }

  const enabledModules = await db.organizationModule.findMany({
    where: { organizationId: membership.organizationId, enabled: true },
    include: { module: true },
  });

  return {
    organizationId: membership.organization.id,
    organization: {
      id: membership.organization.id,
      name: membership.organization.name,
      tenantCode: membership.organization.tenantCode,
      industry: membership.organization.industry,
      status: membership.organization.status,
    },
    role: membership.role?.name ?? null,
    roleId: membership.roleId,
    permissions: membership.role?.rolePermissions.map((rp) => rp.permission.key) ?? [],
    branch: membership.branch
      ? { id: membership.branch.id, name: membership.branch.name, code: membership.branch.code }
      : null,
    enabledModuleKeys: enabledModules.map((om) => om.module.code),
    memberships: allMemberships.map((m) => ({
      organizationId: m.organizationId,
      name: m.organization.name,
      tenantCode: m.organization.tenantCode,
    })),
  };
}

/** Same as getCurrentTenant(), but throws if no tenant context is found. */
export async function requireCurrentTenant(): Promise<TenantContext> {
  const tenant = await getCurrentTenant();
  if (!tenant) {
    throw new Error("No organization membership found for the current user.");
  }
  return tenant;
}
