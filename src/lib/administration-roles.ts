import "server-only";

import { moduleRegistry } from "@/platform/modules/registry";
import { db } from "@/lib/db";

interface AssignableRole {
  name: string;
  isSystem: boolean;
  organizationId: string | null;
  rolePermissions?: Array<{ permission: { key: string } }>;
}

export function isRoleAssignableToOrganization(
  role: AssignableRole,
  organizationId: string,
  enabledModuleKeys: string[],
) {
  if (role.name === "Super Admin") return false;
  if (role.organizationId !== null && role.organizationId !== organizationId) return false;
  if (role.name === "Organization Owner" && role.isSystem) return true;

  const enabledModules = new Set(enabledModuleKeys);
  const roleModuleKeys = (role.rolePermissions ?? []).flatMap(({ permission }) => {
    const module_ = moduleRegistry.find((entry) =>
      entry.permissionPrefix && permission.key.startsWith(entry.permissionPrefix),
    );
    return module_ ? [module_.key] : [];
  });

  if (role.isSystem && roleModuleKeys.length === 0) return false;
  return roleModuleKeys.every((moduleKey) => enabledModules.has(moduleKey));
}

export async function resolveAssignableModuleKeys(organizationId: string, fallbackKeys: string[]) {
  const now = new Date();
  const subscriptions = await db.subscription.findMany({
    where: {
      organizationId,
      status: "ACTIVE",
      startsAt: { lte: now },
      endsAt: { gt: now },
    },
    select: { module: { select: { code: true } } },
  });
  if (subscriptions.length === 0) return fallbackKeys;
  return [...new Set(subscriptions.map(({ module }) => module.code))];
}

export function roleDisplayName(name: string) {
  if (name === "Hire Purchase Manager") return "Installment Manager";
  if (name === "Hire Purchase Staff") return "Installment Staff";
  return name;
}
