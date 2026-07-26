import "server-only";

import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { getServerAuthSession } from "@/lib/auth/session";
import { moduleRegistry } from "@/platform/modules/registry";
import { hasPlatformRole } from "@/lib/auth/platform-identity";

export const ACTIVE_ORG_COOKIE = "active_org";

/** Organization statuses under which the organization may be used normally. */
export const ACTIVE_ORGANIZATION_STATUSES = new Set(["ACTIVE", "TRIAL"]);

export interface TenantContext {
  userId: string;
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
  roleIsSystem: boolean;
  roleOrganizationId: string | null;
  permissions: string[];
  branch: {
    id: string;
    name: string;
    code: string;
  } | null;
  /** Module keys (Module.code) enabled for this organization — drives the module launcher and dashboard. */
  enabledModuleKeys: string[];
  /**
   * Subset of enabledModuleKeys the current user also holds a permission for
   * (same rule as canAccessModule() in src/lib/auth/permissions.ts, computed
   * inline here to avoid a runtime import cycle with that file). This — not
   * enabledModuleKeys — is what any UI listing "modules I can open" or any
   * widget rendering module data must filter on; enabledModuleKeys alone only
   * reflects org-level enablement, not this user's permission to see it.
   */
  accessibleModuleKeys: string[];
  /**
   * Every ACTIVE membership (in an ACTIVE/TRIAL organization) the current
   * user belongs to, for the organization switcher. Includes the active one.
   * Memberships that are INVITED/SUSPENDED/REMOVED, or whose organization is
   * SUSPENDED/CANCELLED, are deliberately excluded — they must never be an
   * implicit or explicit fallback target (see getCurrentTenant()'s doc comment).
   */
  memberships: { organizationId: string; name: string; tenantCode: string }[];
}

/**
 * Resolves the organization (and branch, if assigned) the current signed-in
 * user belongs to. Returns null if there is no session, no matching
 * OrganizationMember record, or the resolvable membership pool is empty (see
 * below), rather than throwing, so callers can decide how to handle a user
 * with no tenant context.
 *
 * This is the single authoritative tenant-state check for the app: it filters
 * to ACTIVE memberships in ACTIVE/TRIAL organizations *before* any selection
 * logic runs, so an INVITED/SUSPENDED/REMOVED membership, or a membership in a
 * SUSPENDED/CANCELLED organization, can never be silently selected as a
 * fallback — it is simply never in the pool being chosen from. Every
 * protected page and Server Action goes through this function (directly or
 * via requireCurrentTenant()) on every request; it is not just a layout-time
 * check, and re-reads the database fresh each call rather than trusting
 * anything cached in the session/JWT.
 *
 * The active organization is normally the one chosen at login
 * (session.user.organizationId), but a user who belongs to more than one
 * organization can switch via the `active_org` cookie (see
 * src/lib/tenant/actions.ts) — honored here only if it names a membership
 * that is still in the valid pool.
 */
export async function getCurrentTenant(): Promise<TenantContext | null> {
  const session = await getServerAuthSession();
  const userId = session?.user?.id;

  if (!userId) {
    return null;
  }

  const allMemberships = await db.organizationMember.findMany({
    where: { userId },
    include: { organization: true, role: true },
    orderBy: { createdAt: "asc" },
  });

  const validMemberships = allMemberships.filter(
    (m) => m.status === "ACTIVE" && ACTIVE_ORGANIZATION_STATUSES.has(m.organization.status),
  );

  if (validMemberships.length === 0) {
    return null;
  }

  const cookieStore = await cookies();
  const requestedOrgId = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;
  const platformMembership = validMemberships.find((membership) => hasPlatformRole(membership.role));
  const effectiveOrgId = platformMembership?.organizationId ||
    (requestedOrgId && validMemberships.some((m) => m.organizationId === requestedOrgId) && requestedOrgId) ||
    (validMemberships.some((m) => m.organizationId === session?.user?.organizationId) && session?.user?.organizationId) ||
    validMemberships[0].organizationId;

  const membership = await db.organizationMember.findFirst({
    where: { userId, organizationId: effectiveOrgId, status: "ACTIVE" },
    include: {
      organization: true,
      branch: true,
      role: { include: { rolePermissions: { include: { permission: true } } } },
    },
  });

  if (!membership || !ACTIVE_ORGANIZATION_STATUSES.has(membership.organization.status)) {
    return null;
  }

  const [enabledModules, subscriptionModules, activeSubscriptions] = await Promise.all([
    db.organizationModule.findMany({
      where: { organizationId: membership.organizationId, enabled: true, module: { status: "ACTIVE" } },
      include: { module: true },
    }),
    db.subscription.findMany({
      where: { organizationId: membership.organizationId },
      select: { moduleId: true },
      distinct: ["moduleId"],
    }),
    db.subscription.findMany({
      where: {
        organizationId: membership.organizationId,
        status: "ACTIVE",
        startsAt: { lte: new Date() },
        endsAt: { gt: new Date() },
      },
      select: { moduleId: true },
    }),
  ]);

  const permissions = membership.role?.rolePermissions.map((rp) => rp.permission.key) ?? [];
  const subscriptionControlled = new Set(subscriptionModules.map((item) => item.moduleId));
  const paidAndCurrent = new Set(activeSubscriptions.map((item) => item.moduleId));
  const enabledModuleKeys = enabledModules
    .filter((om) => !subscriptionControlled.has(om.moduleId) || paidAndCurrent.has(om.moduleId))
    .map((om) => om.module.code);
  const accessibleModuleKeys = enabledModuleKeys.filter((key) => {
    const module_ = moduleRegistry.find((mod) => mod.key === key);
    if (!module_ || module_.status !== "available") return false;
    const prefix = module_.permissionPrefix;
    return !!prefix && permissions.some((permission) => permission.startsWith(prefix));
  });

  const visibleMemberships = platformMembership ? [platformMembership] : validMemberships;

  return {
    userId,
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
    roleIsSystem: membership.role?.isSystem ?? false,
    roleOrganizationId: membership.role?.organizationId ?? null,
    permissions,
    branch: membership.branch
      ? { id: membership.branch.id, name: membership.branch.name, code: membership.branch.code }
      : null,
    enabledModuleKeys,
    accessibleModuleKeys,
    memberships: visibleMemberships.map((m) => ({
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
