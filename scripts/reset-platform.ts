/**
 * Destructive clean-platform bootstrap.
 *
 * Deletes every application row while preserving Prisma migration history,
 * reseeds the system role/permission/module catalog, and creates a fresh
 * platform anchor with separate Super Admin and Organization Owner logins.
 *
 * Run only with:
 *   CONFIRM_DATABASE_RESET=DELETE_ALL_PLATFORM_DATA npx tsx scripts/reset-platform.ts
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { seedPlatform } from "../prisma/seed-data";

const CONFIRMATION = "DELETE_ALL_PLATFORM_DATA";
const db = new PrismaClient();

function password() {
  return `Rf!${randomBytes(15).toString("base64url")}`;
}

async function main() {
  const identity = await db.$queryRaw<Array<{ database: string; schema: string }>>`
    SELECT current_database() AS database, current_schema() AS schema
  `;
  const target = identity[0];
  if (!target?.database || target.schema !== "public") {
    throw new Error("Refusing reset because the database identity or public schema could not be verified.");
  }

  const tables = await db.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
    ORDER BY tablename
  `;
  if (tables.length < 10) {
    throw new Error(`Refusing reset because only ${tables.length} application tables were found.`);
  }
  if (process.argv.includes("--inspect")) {
    console.log(JSON.stringify({
      database: target.database,
      schema: target.schema,
      applicationTables: tables.length,
      users: await db.user.count(),
      organizations: await db.organization.count(),
      memberships: await db.organizationMember.count(),
      roles: await db.role.count(),
      permissions: await db.permission.count(),
      modules: await db.module.count(),
    }, null, 2));
    return;
  }
  if (process.env.CONFIRM_DATABASE_RESET !== CONFIRMATION) {
    throw new Error(`Refusing destructive reset. Set CONFIRM_DATABASE_RESET=${CONFIRMATION}.`);
  }
  const quotedTables = tables.map(({ tablename }) => `"public"."${tablename.replaceAll('"', '""')}"`).join(", ");
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${quotedTables} RESTART IDENTITY CASCADE`);

  await seedPlatform(db, { log: false });

  const superAdminPassword = password();
  const ownerPassword = password();
  const [superAdminRole, ownerRole] = await Promise.all([
    db.role.findFirstOrThrow({ where: { name: "Super Admin", isSystem: true, organizationId: null } }),
    db.role.findFirstOrThrow({ where: { name: "Organization Owner", isSystem: true, organizationId: null } }),
  ]);

  const organization = await db.organization.create({
    data: {
      name: "Rock Frost Business Suite",
      tenantCode: "rock-frost",
      industry: "Software",
      status: "ACTIVE",
      country: "Ghana",
      currency: "GHS",
      timezone: "Africa/Accra",
      defaultLanguage: "en",
      billingEmail: "owner@rockfrostgroup.com",
    },
  });

  const [superAdmin, owner] = await Promise.all([
    db.user.create({
      data: {
        name: "Rock Frost Super Admin",
        email: "superadmin@rockfrostgroup.com",
        status: "ACTIVE",
        emailVerified: new Date(),
        passwordHash: await bcrypt.hash(superAdminPassword, 12),
      },
    }),
    db.user.create({
      data: {
        name: "Rock Frost Organization Owner",
        email: "owner@rockfrostgroup.com",
        status: "ACTIVE",
        emailVerified: new Date(),
        passwordHash: await bcrypt.hash(ownerPassword, 12),
      },
    }),
  ]);

  await db.organizationMember.createMany({
    data: [
      {
        organizationId: organization.id,
        userId: superAdmin.id,
        roleId: superAdminRole.id,
        status: "ACTIVE",
        joinedAt: new Date(),
      },
      {
        organizationId: organization.id,
        userId: owner.id,
        roleId: ownerRole.id,
        status: "ACTIVE",
        joinedAt: new Date(),
      },
    ],
  });

  const counts = {
    users: await db.user.count(),
    organizations: await db.organization.count(),
    memberships: await db.organizationMember.count(),
    roles: await db.role.count(),
    permissions: await db.permission.count(),
    modules: await db.module.count(),
  };

  console.log(JSON.stringify({
    database: target.database,
    schema: target.schema,
    resetTables: tables.length,
    counts,
    credentials: {
      superAdmin: { email: superAdmin.email, password: superAdminPassword },
      organizationOwner: { email: owner.email, password: ownerPassword },
    },
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
