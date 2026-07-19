/**
 * Seeds the Permission and RolePermission tables for the platform's system
 * roles. Idempotent — safe to re-run; existing rows are upserted rather than
 * duplicated. Run with: npx tsx prisma/seed-rbac.ts
 */
import { PrismaClient } from "@prisma/client";
import { PERMISSIONS } from "../lib/permissions/constants";

const db = new PrismaClient();

const ALL_PERMISSIONS = Object.values(PERMISSIONS);

const ROLE_PERMISSIONS: Record<string, string[]> = {
  "Super Admin": ALL_PERMISSIONS,
  "Organization Owner": ALL_PERMISSIONS,
  "Fleet Manager": [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.FLEET_VIEW,
    PERMISSIONS.FLEET_VEHICLES_MANAGE,
    PERMISSIONS.FLEET_OWNERS_MANAGE,
    PERMISSIONS.FLEET_DRIVERS_MANAGE,
    PERMISSIONS.FLEET_INSURANCE_MANAGE,
    PERMISSIONS.FLEET_MAINTENANCE_MANAGE,
    PERMISSIONS.FLEET_WORKANDPAY_MANAGE,
    PERMISSIONS.FLEET_PAYMENTS_MANAGE,
    PERMISSIONS.FLEET_REPORTS_VIEW,
    PERMISSIONS.AI_ASSISTANT_USE,
  ],
  Driver: [PERMISSIONS.DASHBOARD_VIEW, PERMISSIONS.FLEET_VIEW, PERMISSIONS.FLEET_MAINTENANCE_MANAGE, PERMISSIONS.AI_ASSISTANT_USE],
  Mechanic: [PERMISSIONS.DASHBOARD_VIEW, PERMISSIONS.FLEET_VIEW, PERMISSIONS.FLEET_MAINTENANCE_MANAGE, PERMISSIONS.AI_ASSISTANT_USE],
  Investor: [PERMISSIONS.DASHBOARD_VIEW, PERMISSIONS.FLEET_INVESTOR_VIEW, PERMISSIONS.FLEET_REPORTS_VIEW, PERMISSIONS.AI_ASSISTANT_USE],
};

async function main() {
  for (const key of ALL_PERMISSIONS) {
    await db.permission.upsert({
      where: { key },
      update: {},
      create: { key, name: key },
    });
  }

  const roles = await db.role.findMany({ where: { isSystem: true } });
  const permissions = await db.permission.findMany();
  const permissionByKey = new Map(permissions.map((p) => [p.key, p]));

  for (const role of roles) {
    const keys = ROLE_PERMISSIONS[role.name];
    if (!keys) {
      console.warn(`No permission mapping defined for role "${role.name}", skipping.`);
      continue;
    }

    for (const key of keys) {
      const permission = permissionByKey.get(key);
      if (!permission) continue;

      await db.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
    console.log(`Seeded ${keys.length} permissions for role "${role.name}".`);
  }
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
