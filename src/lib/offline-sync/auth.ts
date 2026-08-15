import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import type { TenantContext } from "@/lib/tenant";
import { ACTIVE_ORGANIZATION_STATUSES } from "@/lib/tenant";
import { OFFLINE_SYNC_LIMITS, OFFLINE_SUPPORTED_MODULES, type OfflineSupportedModule } from "@/lib/offline-sync/contract";
import { moduleRegistry } from "@/platform/modules/registry";
import { expandProductModuleKeys, primaryProductKey } from "@/platform/modules/product-groups";

export class OfflineAuthenticationError extends Error {
  constructor(message: string, public readonly status: 401 | 403 = 401) {
    super(message);
  }
}

function tokenHash(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function createOfflineToken(deviceId: string) {
  const token = `rfd_${deviceId}.${randomBytes(32).toString("base64url")}`;
  return { token, hash: tokenHash(token) };
}

function extractDeviceId(token: string) {
  const match = /^rfd_([a-z0-9]+)\.[A-Za-z0-9_-]{40,}$/.exec(token);
  return match?.[1] ?? null;
}

function hashesMatch(expectedHex: string, actualHex: string) {
  const expected = Buffer.from(expectedHex, "hex");
  const actual = Buffer.from(actualHex, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export interface OfflineDeviceContext {
  device: {
    id: string;
    organizationId: string;
    userId: string;
    membershipId: string;
    moduleKeys: string[];
    offlineAccessUntil: Date;
  };
  tenant: TenantContext;
  authorizedModuleKeys: OfflineSupportedModule[];
}

async function resolveCurrentEnabledModuleKeys(organizationId: string) {
  const now = new Date();
  const [assignments, subscriptionModules, activeSubscriptions] = await Promise.all([
    db.organizationModule.findMany({
      where: { organizationId, enabled: true, module: { status: "ACTIVE" } },
      select: { module: { select: { code: true } } },
    }),
    db.subscription.findMany({
      where: { organizationId },
      select: { module: { select: { code: true } } },
    }),
    db.subscription.findMany({
      where: { organizationId, status: "ACTIVE", startsAt: { lte: now }, endsAt: { gt: now } },
      select: { module: { select: { code: true } } },
    }),
  ]);
  const controlledProducts = new Set(subscriptionModules.map(({ module }) => primaryProductKey(module.code)));
  const currentProducts = new Set(activeSubscriptions.map(({ module }) => primaryProductKey(module.code)));
  return expandProductModuleKeys(assignments
    .map(({ module }) => module.code)
    .filter((code) => !controlledProducts.has(primaryProductKey(code)) || currentProducts.has(primaryProductKey(code))));
}

export async function resolveTenantForOfflineIdentity(
  organizationId: string,
  userId: string,
  membershipId: string,
): Promise<TenantContext> {
  const membership = await db.organizationMember.findFirst({
    where: { id: membershipId, organizationId, userId },
    include: {
      organization: true,
      user: true,
      branch: true,
      role: { include: { rolePermissions: { include: { permission: true } } } },
    },
  });
  if (!membership || membership.status !== "ACTIVE" || membership.user.status !== "ACTIVE") {
    throw new OfflineAuthenticationError("This account no longer has desktop access.", 403);
  }
  if (!ACTIVE_ORGANIZATION_STATUSES.has(membership.organization.status)) {
    throw new OfflineAuthenticationError("This organization is not active.", 403);
  }
  const enabledModuleKeys = await resolveCurrentEnabledModuleKeys(organizationId);
  const permissions = membership.role?.rolePermissions.map(({ permission }) => permission.key) ?? [];
  const accessibleModuleKeys = enabledModuleKeys.filter((key) => {
    const moduleDefinition = moduleRegistry.find((candidate) => candidate.key === key);
    return !!moduleDefinition?.permissionPrefix && permissions.some((permission) => permission.startsWith(moduleDefinition.permissionPrefix!));
  });
  return {
    userId,
    organizationId,
    organization: {
      id: organizationId,
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
    branch: membership.branch ? { id: membership.branch.id, name: membership.branch.name, code: membership.branch.code } : null,
    enabledModuleKeys,
    accessibleModuleKeys,
    memberships: [{ organizationId, name: membership.organization.name, tenantCode: membership.organization.tenantCode }],
  };
}

export async function authenticateOfflineDevice(request: Request): Promise<OfflineDeviceContext> {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token || token.length > 256) throw new OfflineAuthenticationError("Desktop authentication is required.");

  const deviceId = extractDeviceId(token);
  if (!deviceId) throw new OfflineAuthenticationError("Desktop authentication is invalid.");

  const device = await db.offlineDevice.findUnique({
    where: { id: deviceId },
    include: {
      organization: true,
      user: true,
      membership: {
        include: {
          branch: true,
          role: { include: { rolePermissions: { include: { permission: true } } } },
        },
      },
    },
  });

  const now = new Date();
  if (!device || !hashesMatch(device.tokenHash, tokenHash(token))) {
    throw new OfflineAuthenticationError("Desktop authentication is invalid.");
  }
  if (device.status !== "ACTIVE") throw new OfflineAuthenticationError("This desktop device has been revoked.", 403);
  if (device.tokenExpiresAt <= now) throw new OfflineAuthenticationError("Desktop authentication has expired.");
  if (device.user.status !== "ACTIVE" || device.membership.status !== "ACTIVE") {
    throw new OfflineAuthenticationError("This account no longer has desktop access.", 403);
  }
  if (!ACTIVE_ORGANIZATION_STATUSES.has(device.organization.status)) {
    throw new OfflineAuthenticationError("This organization is not active.", 403);
  }

  const activeKeys = await resolveCurrentEnabledModuleKeys(device.organizationId);
  const permissions = device.membership.role?.rolePermissions.map(({ permission }) => permission.key) ?? [];
  const accessibleModuleKeys = activeKeys.filter((key) => {
    const moduleDefinition = moduleRegistry.find((candidate) => candidate.key === key);
    return !!moduleDefinition?.permissionPrefix && permissions.some((permission) => permission.startsWith(moduleDefinition.permissionPrefix!));
  });
  const authorizedModuleKeys = device.moduleKeys.filter(
    (key): key is OfflineSupportedModule =>
      OFFLINE_SUPPORTED_MODULES.includes(key as OfflineSupportedModule) && accessibleModuleKeys.includes(key),
  );
  if (authorizedModuleKeys.length === 0) {
    throw new OfflineAuthenticationError("No subscribed desktop module remains available to this account.", 403);
  }

  const tenant: TenantContext = {
    userId: device.userId,
    organizationId: device.organizationId,
    organization: {
      id: device.organization.id,
      name: device.organization.name,
      tenantCode: device.organization.tenantCode,
      industry: device.organization.industry,
      status: device.organization.status,
    },
    role: device.membership.role?.name ?? null,
    roleId: device.membership.roleId,
    roleIsSystem: device.membership.role?.isSystem ?? false,
    roleOrganizationId: device.membership.role?.organizationId ?? null,
    permissions,
    branch: device.membership.branch
      ? { id: device.membership.branch.id, name: device.membership.branch.name, code: device.membership.branch.code }
      : null,
    enabledModuleKeys: activeKeys,
    accessibleModuleKeys,
    memberships: [{
      organizationId: device.organizationId,
      name: device.organization.name,
      tenantCode: device.organization.tenantCode,
    }],
  };

  const offlineAccessUntil = new Date(now.getTime() + OFFLINE_SYNC_LIMITS.offlineAccessHours * 60 * 60 * 1000);
  await db.offlineDevice.update({
    where: { id: device.id },
    data: { lastSeenAt: now, offlineAccessUntil },
  });

  return {
    device: {
      id: device.id,
      organizationId: device.organizationId,
      userId: device.userId,
      membershipId: device.membershipId,
      moduleKeys: device.moduleKeys,
      offlineAccessUntil,
    },
    tenant,
    authorizedModuleKeys,
  };
}
