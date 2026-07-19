import "server-only";

import { db } from "@/lib/db";
import { getServerAuthSession } from "@/lib/auth/session";

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
}

/**
 * Resolves the organization (and branch, if assigned) the current signed-in
 * user belongs to. Returns null if there is no session or no matching
 * OrganizationMember record, rather than throwing, so callers can decide how
 * to handle a user with no tenant context.
 */
export async function getCurrentTenant(): Promise<TenantContext | null> {
  const session = await getServerAuthSession();
  const userId = session?.user?.id;
  const organizationId = session?.user?.organizationId;

  if (!userId || !organizationId) {
    return null;
  }

  const membership = await db.organizationMember.findFirst({
    where: { userId, organizationId },
    include: {
      organization: true,
      branch: true,
      role: { include: { rolePermissions: { include: { permission: true } } } },
    },
  });

  if (!membership) {
    return null;
  }

  return {
    organizationId: membership.organization.id,
    organization: {
      id: membership.organization.id,
      name: membership.organization.name,
      tenantCode: membership.organization.tenantCode,
      industry: membership.organization.industry,
      status: membership.organization.status,
    },
    role: session?.user?.role ?? null,
    roleId: membership.roleId,
    permissions: membership.role?.rolePermissions.map((rp) => rp.permission.key) ?? [],
    branch: membership.branch
      ? { id: membership.branch.id, name: membership.branch.name, code: membership.branch.code }
      : null,
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
