"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { invitationEmail } from "@/lib/email-templates";
import { createInvitation, markInvitationDeliveryFailed } from "@/lib/auth/invitations";
import { getServerAuthSession } from "@/lib/auth/session";
import { isPlatformUser } from "@/lib/auth/platform-identity";
import { isRoleAssignableToOrganization, resolveAssignableModuleKeys } from "@/lib/administration-roles";
import { assertRoleHasAvailableSeats, SeatLimitExceededError } from "@/platform/subscriptions/seats";
import { buildTenantAppUrl } from "@/lib/app-url";
import { logAuditEvent } from "@/lib/audit";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { createFleetOwner, updateFleetOwner, createFleetOwnerAgreement, NotFoundError } from "@/modules/fleet/service";
import { shortText, longText, email as emailSchema, moneyAmountNonNegative, percent0to100, cuid, parseWithSchema } from "@/lib/validation";

class PlatformOwnerTenantError extends Error {}

async function getFleetOwnerRole(organizationId: string, enabledModuleKeys: string[]) {
  const role = await db.role.findFirst({
    where: { name: "Vehicle Owner", OR: [{ organizationId }, { isSystem: true }] },
    include: { rolePermissions: { include: { permission: true } } },
  });
  if (!role) return null;
  const assignableModuleKeys = await resolveAssignableModuleKeys(organizationId, enabledModuleKeys);
  return isRoleAssignableToOrganization(role, organizationId, assignableModuleKeys) ? role : null;
}

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

const ownerSchema = z.object({
  name: shortText,
  businessName: longText.optional(),
  phone: longText.optional(),
  email: emailSchema.optional(),
});

export async function upsertFleetOwner(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("fleet");
  if (!hasPermission(tenant, PERMISSIONS.FLEET_OWNERS_MANAGE)) {
    redirect("/app/fleet/owners?error=forbidden");
  }

  const id = clean(formData.get("id"));
  const name = clean(formData.get("name"));
  if (!name) {
    redirect("/app/fleet/owners?error=missing-fields");
  }

  const parsed = parseWithSchema(ownerSchema, {
    name,
    businessName: clean(formData.get("businessName")) ?? undefined,
    phone: clean(formData.get("phone")) ?? undefined,
    email: clean(formData.get("email")) ?? undefined,
  });
  if (!parsed.success) {
    redirect("/app/fleet/owners?error=invalid-input");
  }

  const data = {
    name: parsed.data.name,
    businessName: parsed.data.businessName ?? null,
    phone: parsed.data.phone ?? null,
    email: parsed.data.email ?? null,
    userId: clean(formData.get("userId")),
  };

  if (id) {
    await updateFleetOwner(tenant.organizationId, id, data);
  } else {
    await createFleetOwner(tenant.organizationId, data);
  }

  revalidatePath("/app/fleet/owners");
  redirect("/app/fleet/owners?saved=1");
}

const agreementSchema = z.object({
  ownerId: cuid,
  revenueSharePercent: z.preprocess((value) => (typeof value === "string" && value.trim() === "" ? undefined : value), percent0to100.optional()),
  managementFeeFlat: z.preprocess((value) => (typeof value === "string" && value.trim() === "" ? undefined : value), moneyAmountNonNegative.optional()),
  managementFeePercent: z.preprocess((value) => (typeof value === "string" && value.trim() === "" ? undefined : value), percent0to100.optional()),
});

/**
 * Always creates a new agreement row rather than editing one in place -
 * createFleetOwnerAgreement closes out whatever was previously open in the
 * same (owner, portfolio-wide) scope as of today, so a settlement computed
 * for a past period still resolves the terms that were actually in effect
 * then. The dialog itself is pre-filled with the current terms, so from the
 * manager's perspective this reads as "editing" even though it's really
 * "superseding". Portfolio-wide only (vehicleId left unset) - per-vehicle
 * overrides exist in the schema but aren't exposed from this page yet.
 */
export async function setOwnerAgreement(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("fleet");
  if (!hasPermission(tenant, PERMISSIONS.FLEET_OWNERS_MANAGE)) {
    redirect("/app/fleet/owners?error=forbidden");
  }

  const ownerId = clean(formData.get("ownerId"));
  if (!ownerId) {
    redirect("/app/fleet/owners?error=missing-fields");
  }

  const parsed = parseWithSchema(agreementSchema, {
    ownerId,
    revenueSharePercent: clean(formData.get("revenueSharePercent")) ?? undefined,
    managementFeeFlat: clean(formData.get("managementFeeFlat")) ?? undefined,
    managementFeePercent: clean(formData.get("managementFeePercent")) ?? undefined,
  });
  if (!parsed.success) {
    redirect("/app/fleet/owners?error=invalid-agreement");
  }

  const session = await getServerAuthSession();
  try {
    await createFleetOwnerAgreement(tenant.organizationId, {
      ownerId: parsed.data.ownerId,
      revenueSharePercent: parsed.data.revenueSharePercent !== undefined ? String(parsed.data.revenueSharePercent) : null,
      managementFeeFlat: parsed.data.managementFeeFlat ?? null,
      managementFeePercent: parsed.data.managementFeePercent !== undefined ? String(parsed.data.managementFeePercent) : null,
      createdById: session?.user?.id,
    });
  } catch (error) {
    if (error instanceof NotFoundError) redirect("/app/fleet/owners?error=not-found");
    throw error;
  }

  revalidatePath("/app/fleet/owners");
  revalidatePath("/app/fleet/investor");
  redirect("/app/fleet/owners?saved=1");
}

const inviteSchema = z.object({ name: shortText, email: emailSchema });

/**
 * Invites an owner by email with the fixed "Vehicle Owner" role. Mirrors
 * inviteFleetDriver in src/app/app/fleet/drivers/actions.ts - see that
 * function's comment for why this duplicates Administration's inviteMember
 * shape rather than sharing it. ensureFleetOwnerForUser runs on acceptance
 * and links/creates the roster row (and its portal login) automatically.
 */
export async function inviteFleetOwner(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("fleet");
  if (!hasPermission(tenant, PERMISSIONS.FLEET_OWNERS_MANAGE)) {
    redirect("/app/fleet/owners?error=forbidden");
  }

  const parsed = parseWithSchema(inviteSchema, {
    name: clean(formData.get("name")) ?? "",
    email: clean(formData.get("email")) ?? "",
  });
  if (!parsed.success) {
    redirect("/app/fleet/owners?error=invalid-input");
  }
  const { name, email } = parsed.data;

  const role = await getFleetOwnerRole(tenant.organizationId, tenant.enabledModuleKeys);
  if (!role) {
    redirect("/app/fleet/owners?error=role-unavailable");
  }

  const existingUser = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (existingUser && (await isPlatformUser(existingUser.id))) {
    redirect("/app/fleet/owners?error=platform-owner");
  }

  const session = await getServerAuthSession();
  let membership;
  try {
    membership = await db.$transaction(async (tx) => {
      const user = await tx.user.upsert({ where: { email }, update: {}, create: { email, name, status: "INVITED" } });
      if (await isPlatformUser(user.id, tx)) throw new PlatformOwnerTenantError();

      const existingMembership = await tx.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId: tenant.organizationId, userId: user.id } },
        select: { id: true },
      });
      await assertRoleHasAvailableSeats(tx, tenant.organizationId, role.id, existingMembership?.id);

      const member = await tx.organizationMember.upsert({
        where: { organizationId_userId: { organizationId: tenant.organizationId, userId: user.id } },
        update: { roleId: role.id, status: "INVITED" },
        create: { organizationId: tenant.organizationId, userId: user.id, roleId: role.id, status: "INVITED" },
      });

      await logAuditEvent(
        {
          organizationId: tenant.organizationId,
          userId: session?.user?.id,
          module: "fleet",
          action: "fleet.owner.invited",
          entityName: "OrganizationMember",
          entityId: member.id,
          metadata: { email },
        },
        tx,
      );

      return member;
    });
  } catch (error) {
    if (error instanceof PlatformOwnerTenantError) redirect("/app/fleet/owners?error=platform-owner");
    if (error instanceof SeatLimitExceededError) redirect("/app/fleet/owners?error=seat-limit");
    throw error;
  }

  const token = await createInvitation({
    organizationId: tenant.organizationId,
    membershipId: membership.id,
    email,
    createdById: session?.user?.id ?? null,
  });
  const inviteUrl = buildTenantAppUrl("/invite", { token });
  const result = await sendEmail({ to: email, ...invitationEmail({ organizationName: tenant.organization.name, roleName: role.name, inviteUrl }) });
  if (!result.ok) {
    await markInvitationDeliveryFailed(membership.id);
    revalidatePath("/app/fleet/owners");
    redirect("/app/fleet/owners?error=delivery-failed");
  }

  revalidatePath("/app/fleet/owners");
  redirect("/app/fleet/owners?invited=1");
}
