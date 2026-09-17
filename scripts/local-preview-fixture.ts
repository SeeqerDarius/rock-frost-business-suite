/**
 * Local-only, additive preview fixture. Creates a platform anchor with one
 * Super Admin login and one realistic tenant organization so a UI change can
 * be looked at in a browser. Deletes nothing and refuses to run against
 * anything but a localhost database.
 *
 * Run with:
 *   npx tsx scripts/local-preview-fixture.ts
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const OPERATOR_EMAIL = "operator@localhost.test";
/**
 * Override with LOCAL_PREVIEW_PASSWORD. The default is deliberately an
 * obvious throwaway: this script refuses any database that is not on
 * localhost, so the login it creates never exists anywhere it could matter.
 */
const OPERATOR_PASSWORD = process.env.LOCAL_PREVIEW_PASSWORD ?? "LocalPreview!2026";

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.includes("localhost") && !url.includes("127.0.0.1")) {
    throw new Error("Refusing to run: DATABASE_URL is not a localhost database.");
  }

  const superAdmin = await db.role.findFirst({ where: { name: "Super Admin", organizationId: null } });
  const owner = await db.role.findFirst({ where: { name: "Organization Owner", organizationId: null } });
  if (!superAdmin || !owner) throw new Error("Run `npm run db:seed` first.");

  const passwordHash = await bcrypt.hash(OPERATOR_PASSWORD, 12);
  const anchor = await db.organization.upsert({
    where: { tenantCode: "rockfrost" },
    update: {},
    create: {
      name: "Rock Frost Group",
      tenantCode: "rockfrost",
      status: "ACTIVE",
      currency: "GHS",
      timezone: "Africa/Accra",
      defaultLanguage: "en",
    },
  });
  const operator = await db.user.upsert({
    where: { email: OPERATOR_EMAIL },
    update: { passwordHash, emailVerified: new Date(), status: "ACTIVE" },
    create: {
      email: OPERATOR_EMAIL,
      name: "Local Operator",
      passwordHash,
      emailVerified: new Date(),
      status: "ACTIVE",
    },
  });
  await db.organizationMember.upsert({
    where: { organizationId_userId: { organizationId: anchor.id, userId: operator.id } },
    update: { roleId: superAdmin.id, status: "ACTIVE" },
    create: { organizationId: anchor.id, userId: operator.id, roleId: superAdmin.id, status: "ACTIVE" },
  });

  const tenant = await db.organization.upsert({
    where: { tenantCode: "achimota" },
    update: {},
    create: {
      name: "Achimota Senior High",
      tenantCode: "achimota",
      status: "ACTIVE",
      industry: "Education",
      billingEmail: "bursar@achimota.test",
      email: "info@achimota.test",
      phone: "0302912345",
      country: "Ghana",
      region: "Greater Accra",
      city: "Accra",
      currency: "GHS",
      timezone: "Africa/Accra",
      defaultLanguage: "en",
      smsNotificationsGranted: true,
      smsNotificationsGrantedAt: new Date(),
      schoolPortalGranted: true,
      schoolPortalGrantedAt: new Date(),
    },
  });

  for (const code of ["school", "accounting", "hr"]) {
    const module_ = await db.module.findUnique({ where: { code } });
    if (!module_) continue;
    await db.organizationModule.upsert({
      where: { organizationId_moduleId: { organizationId: tenant.id, moduleId: module_.id } },
      update: { enabled: true },
      create: { organizationId: tenant.id, moduleId: module_.id, enabled: true },
    });
  }

  const schoolModule = await db.module.findUnique({ where: { code: "school" } });
  if (schoolModule && (await db.subscription.count({ where: { organizationId: tenant.id } })) === 0) {
    const now = new Date();
    await db.subscription.create({
      data: {
        organizationId: tenant.id,
        moduleId: schoolModule.id,
        mode: "MANUAL_OFFLINE",
        status: "ACTIVE",
        durationMonths: 12,
        amount: 7200,
        currency: "GHS",
        startsAt: now,
        endsAt: new Date(now.getFullYear() + 1, now.getMonth(), now.getDate()),
        seatLimit: 25,
        paymentReference: "BANK-2026-00418",
        paymentMethod: "Bank transfer",
        notes: "Annual agreement negotiated with the bursary.",
        createdById: operator.id,
        activatedById: operator.id,
        paidAt: now,
      },
    });
  }

  for (const [email, name, status] of [
    ["head@achimota.test", "Head Teacher", "ACTIVE"],
    ["bursar@achimota.test", "Bursar", "ACTIVE"],
    ["newstaff@achimota.test", "Pending Staff", "INVITED"],
  ] as const) {
    const user = await db.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        name,
        passwordHash,
        status: status === "ACTIVE" ? "ACTIVE" : "INVITED",
        emailVerified: status === "ACTIVE" ? new Date() : null,
      },
    });
    await db.organizationMember.upsert({
      where: { organizationId_userId: { organizationId: tenant.id, userId: user.id } },
      update: {},
      create: { organizationId: tenant.id, userId: user.id, roleId: owner.id, status },
    });
  }

  if ((await db.moduleRequest.count({ where: { organizationId: tenant.id } })) === 0) {
    await db.moduleRequest.create({
      data: {
        organizationId: tenant.id,
        moduleId: schoolModule?.id,
        requestedById: operator.id,
        type: "CUSTOMIZE_EXISTING",
        status: "UNDER_REVIEW",
        title: "Add a second campus to the broadsheet",
        customizationDetails: "The annex campus needs its own ranking.",
        businessJustification: "The annex is examined separately and its results cannot be ranked with the main campus.",
      },
    });
  }

  console.log(`Operator: ${OPERATOR_EMAIL} / ${OPERATOR_PASSWORD}`);
  console.log(`Tenant organization id: ${tenant.id}`);
}

main().finally(() => db.$disconnect());
