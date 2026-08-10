import "server-only";

import { moduleRegistry } from "@/platform/modules/registry";

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
