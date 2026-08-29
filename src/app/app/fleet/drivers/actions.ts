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
import { createFleetDriver, updateFleetDriver, FleetDriverLoginConflictError } from "@/modules/fleet/service";
import { shortText, longText, email as emailSchema, dateInput, parseWithSchema } from "@/lib/validation";

class PlatformOwnerTenantError extends Error {}

/**
 * Resolves the system "Driver" role for this org, the same way
 * Administration's getAssignableRole does for a user-picked role - Fleet's
 * invite always targets this one fixed role, so there is no NOT_INVITABLE
 * check to duplicate (that guard only matters for "Super Admin").
 */
async function getFleetDriverRole(organizationId: string, enabledModuleKeys: string[]) {
  const role = await db.role.findFirst({
    where: { name: "Driver", OR: [{ organizationId }, { isSystem: true }] },
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

const driverStatusSchema = z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]);

const driverSchema = z.object({
  name: shortText,
  licenceNumber: longText.optional(),
  licenceExpiry: dateInput.optional(),
  phone: longText.optional(),
  email: emailSchema.optional(),
  status: driverStatusSchema.optional(),
  employmentStartDate: dateInput.optional(),
  userId: z.string().cuid().optional(),
});

export async function upsertFleetDriver(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("fleet");
  if (!hasPermission(tenant, PERMISSIONS.FLEET_DRIVERS_MANAGE)) {
    redirect("/app/fleet/drivers?error=forbidden");
  }

  const id = clean(formData.get("id"));
  const name = clean(formData.get("name"));
  if (!name) {
    redirect("/app/fleet/drivers?error=missing-fields");
  }

  const parsed = parseWithSchema(driverSchema, {
    name,
    licenceNumber: clean(formData.get("licenceNumber")) ?? undefined,
    licenceExpiry: clean(formData.get("licenceExpiry")) ?? undefined,
    phone: clean(formData.get("phone")) ?? undefined,
    email: clean(formData.get("email")) ?? undefined,
    status: clean(formData.get("status")) ?? undefined,
    employmentStartDate: clean(formData.get("employmentStartDate")) ?? undefined,
    userId: clean(formData.get("userId")) ?? undefined,
  });
  if (!parsed.success) {
    redirect("/app/fleet/drivers?error=invalid-input");
  }

  const data = {
    name: parsed.data.name,
    licenceNumber: parsed.data.licenceNumber ?? null,
    licenceExpiry: parsed.data.licenceExpiry ?? null,
    phone: parsed.data.phone ?? null,
    email: parsed.data.email ?? null,
    status: parsed.data.status ?? "ACTIVE",
    employmentStartDate: parsed.data.employmentStartDate ?? null,
    userId: parsed.data.userId ?? null,
  };

  try {
    if (id) {
      await updateFleetDriver(tenant.organizationId, id, data);
    } else {
      await createFleetDriver(tenant.organizationId, data);
    }
  } catch (error) {
    if (error instanceof FleetDriverLoginConflictError) {
      redirect("/app/fleet/drivers?error=login-linked");
    }
    throw error;
  }

  revalidatePath("/app/fleet/drivers");
  redirect("/app/fleet/drivers?saved=1");
}

const inviteSchema = z.object({ name: shortText, email: emailSchema });

/**
 * Invites a driver by email with the fixed "Driver" role - reuses the exact
 * user/membership/invitation transaction shape Administration's inviteMember
 * uses (see src/app/app/(overview)/administration/actions.ts), scoped to
 * Fleet's own manage permission instead of ORG_SETTINGS_MANAGE so a Fleet
 * manager without full Administration access can still invite drivers.
 * ensureFleetDriverForUser (see src/modules/fleet/service.ts) runs on
 * acceptance and links/creates the roster row automatically.
 */
export async function inviteFleetDriver(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("fleet");
  if (!hasPermission(tenant, PERMISSIONS.FLEET_DRIVERS_MANAGE)) {
    redirect("/app/fleet/drivers?error=forbidden");
  }

  const parsed = parseWithSchema(inviteSchema, {
    name: clean(formData.get("name")) ?? "",
    email: clean(formData.get("email")) ?? "",
  });
  if (!parsed.success) {
    redirect("/app/fleet/drivers?error=invalid-input");
  }
  const { name, email } = parsed.data;

  const role = await getFleetDriverRole(tenant.organizationId, tenant.enabledModuleKeys);
  if (!role) {
    redirect("/app/fleet/drivers?error=role-unavailable");
  }

  const existingUser = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (existingUser && (await isPlatformUser(existingUser.id))) {
    redirect("/app/fleet/drivers?error=platform-owner");
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
          action: "fleet.driver.invited",
          entityName: "OrganizationMember",
          entityId: member.id,
          metadata: { email },
        },
        tx,
      );

      return member;
    });
  } catch (error) {
    if (error instanceof PlatformOwnerTenantError) redirect("/app/fleet/drivers?error=platform-owner");
    if (error instanceof SeatLimitExceededError) redirect("/app/fleet/drivers?error=seat-limit");
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
    revalidatePath("/app/fleet/drivers");
    redirect("/app/fleet/drivers?error=delivery-failed");
  }

  revalidatePath("/app/fleet/drivers");
  redirect("/app/fleet/drivers?invited=1");
}
