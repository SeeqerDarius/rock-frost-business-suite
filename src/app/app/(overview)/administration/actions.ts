"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { invitationEmail } from "@/lib/email-templates";
import { createInvitation, resendInvitation, revokeInvitation, markInvitationDeliveryFailed, InvitationError } from "@/lib/auth/invitations";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import { shortText, email as emailSchema, parseWithSchema } from "@/lib/validation";
import { logAuditEvent } from "@/lib/audit";
import { buildTenantAppUrl } from "@/lib/app-url";
import { isPlatformUser } from "@/lib/auth/platform-identity";
import { isRoleAssignableToOrganization, resolveAssignableModuleKeys, roleDisplayName } from "@/lib/administration-roles";
import { assertRoleHasAvailableSeats, SeatLimitExceededError } from "@/platform/subscriptions/seats";
import { ensureFleetDriverForUser } from "@/modules/fleet/service";

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

/**
 * Reserved for Rock Frost operators, never assignable from a tenant's own
 * Administration page — granting it here would let an Organization Owner
 * escalate themselves (or anyone) into the platform operator role.
 */
const NOT_INVITABLE_ROLES = new Set(["Super Admin"]);
class PlatformOwnerTenantError extends Error {}

async function getAssignableRole(organizationId: string, enabledModuleKeys: string[], roleId: string) {
  const role = await db.role.findFirst({
    where: { id: roleId, OR: [{ organizationId }, { isSystem: true }] },
    include: { rolePermissions: { include: { permission: true } } },
  });
  const assignableModuleKeys = await resolveAssignableModuleKeys(organizationId, enabledModuleKeys);
  return role && !NOT_INVITABLE_ROLES.has(role.name) && isRoleAssignableToOrganization(role, organizationId, assignableModuleKeys)
    ? role
    : null;
}

export async function inviteMember(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.ORG_SETTINGS_MANAGE)) {
    redirect("/app/administration?error=forbidden");
  }

  const roleId = clean(formData.get("roleId"));
  if (!roleId) {
    redirect("/app/administration?error=missing-fields");
  }

  const parsed = parseWithSchema(
    z.object({ name: shortText, email: emailSchema }),
    { name: clean(formData.get("name")), email: clean(formData.get("email")) },
  );
  if (!parsed.success) {
    redirect("/app/administration?error=missing-fields");
  }
  const { name, email } = parsed.data;
  const existingUser = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (existingUser && await isPlatformUser(existingUser.id)) {
    redirect("/app/administration?error=platform-owner");
  }

  const role = await getAssignableRole(tenant.organizationId, tenant.enabledModuleKeys, roleId);
  if (!role) {
    redirect("/app/administration?error=invalid-role");
  }

  const session = await getServerAuthSession();

  let membership;
  try {
    membership = await db.$transaction(async (tx) => {
      const user = await tx.user.upsert({
        where: { email },
        update: {},
        create: { email, name, status: "INVITED" },
      });

      if (await isPlatformUser(user.id, tx)) throw new PlatformOwnerTenantError();

      const existingMembership = await tx.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId: tenant.organizationId, userId: user.id } },
        select: { id: true },
      });
      await assertRoleHasAvailableSeats(tx, tenant.organizationId, roleId, existingMembership?.id);

      const member = await tx.organizationMember.upsert({
        where: { organizationId_userId: { organizationId: tenant.organizationId, userId: user.id } },
        update: { roleId, status: "INVITED" },
        create: {
          organizationId: tenant.organizationId,
          userId: user.id,
          roleId,
          status: "INVITED",
        },
      });

    await logAuditEvent(
      {
        organizationId: tenant.organizationId,
        userId: session?.user?.id,
        module: "administration",
        action: "invitation.created",
        entityName: "OrganizationMember",
        entityId: member.id,
        metadata: { email, role: role.name },
      },
      tx,
    );

      return member;
    });
  } catch (error) {
    if (error instanceof PlatformOwnerTenantError) redirect("/app/administration?error=platform-owner");
    if (error instanceof SeatLimitExceededError) redirect("/app/administration?error=seat-limit");
    throw error;
  }

  const token = await createInvitation({
    organizationId: tenant.organizationId,
    membershipId: membership.id,
    email,
    createdById: session?.user?.id ?? null,
  });
  const inviteUrl = buildTenantAppUrl("/invite", { token });

  const result = await sendEmail({ to: email, ...invitationEmail({ organizationName: tenant.organization.name, roleName: roleDisplayName(role.name), inviteUrl }) });

  if (!result.ok) {
    await markInvitationDeliveryFailed(membership.id);
    revalidatePath("/app/administration");
    redirect("/app/administration?error=delivery-failed");
  }

  revalidatePath("/app/administration");
  redirect("/app/administration?invited=1");
}

export async function changeMemberRole(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.ORG_SETTINGS_MANAGE)) redirect("/app/administration?error=forbidden");

  const parsed = parseWithSchema(z.object({ membershipId: z.string().cuid(), roleId: z.string().cuid() }), Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/administration?error=missing-fields");
  const role = await getAssignableRole(tenant.organizationId, tenant.enabledModuleKeys, parsed.data.roleId);
  if (!role) redirect("/app/administration?error=invalid-role");

  try {
    await db.$transaction(async (tx) => {
      const member = await tx.organizationMember.findFirst({
        where: { id: parsed.data.membershipId, organizationId: tenant.organizationId, status: { not: "REMOVED" } },
        include: { role: true },
      });
      if (!member) throw new Error("MEMBER_NOT_FOUND");
      if (member.roleId === role.id) return;

      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`member-management:${tenant.organizationId}`}))`;
      if (member.role?.name === "Organization Owner" && role.name !== "Organization Owner" && member.status === "ACTIVE") {
        const owners = await tx.organizationMember.count({
          where: { organizationId: tenant.organizationId, status: "ACTIVE", role: { name: "Organization Owner" } },
        });
        if (owners <= 1) throw new Error("LAST_OWNER");
      }
      if (member.status === "ACTIVE" || member.status === "INVITED") {
        await assertRoleHasAvailableSeats(tx, tenant.organizationId, role.id, member.id);
      }
      await tx.organizationMember.update({ where: { id: member.id }, data: { roleId: role.id } });
      // The member is already logged-in/active, so this is the same moment
      // a manager would otherwise have to remember to go create a matching
      // FleetDriver row by hand — see ensureFleetDriverForUser's own
      // comment for the full reasoning. An INVITED member's driver record
      // is created when they accept the invitation instead, in
      // acceptInvitationNewUser/acceptInvitationExistingUser.
      if (member.status === "ACTIVE" && role.rolePermissions.some((rp) => rp.permission.key === PERMISSIONS.FLEET_DRIVER_SELF_SERVICE)) {
        await ensureFleetDriverForUser(tx, tenant.organizationId, member.userId);
      }
      await logAuditEvent({
        organizationId: tenant.organizationId,
        userId: tenant.userId,
        membershipId: member.id,
        module: "administration",
        action: "member.role_changed",
        entityName: "OrganizationMember",
        entityId: member.id,
        metadata: { previousRoleId: member.roleId, roleId: role.id, roleName: role.name },
      }, tx);
    });
  } catch (error) {
    if (error instanceof SeatLimitExceededError) redirect("/app/administration?error=seat-limit");
    if (error instanceof Error && error.message === "LAST_OWNER") redirect("/app/administration?error=last-owner");
    if (error instanceof Error && error.message === "MEMBER_NOT_FOUND") redirect("/app/administration?error=not-found");
    throw error;
  }
  revalidatePath("/app/administration");
  revalidatePath("/app/organization/billing");
  redirect("/app/administration?roleChanged=1");
}

export async function deactivateMember(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.ORG_SETTINGS_MANAGE)) redirect("/app/administration?error=forbidden");
  const membershipId = clean(formData.get("membershipId"));
  if (!membershipId) redirect("/app/administration?error=missing-fields");
  const currentMembership = await db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: tenant.organizationId, userId: tenant.userId } },
    select: { id: true },
  });
  if (membershipId === currentMembership?.id) redirect("/app/administration?error=self-deactivate");

  try {
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`member-management:${tenant.organizationId}`}))`;
      const member = await tx.organizationMember.findFirst({
        where: { id: membershipId, organizationId: tenant.organizationId, status: "ACTIVE" },
        include: { role: true },
      });
      if (!member) throw new Error("MEMBER_NOT_FOUND");
      if (member.role?.name === "Organization Owner") {
        const owners = await tx.organizationMember.count({
          where: { organizationId: tenant.organizationId, status: "ACTIVE", role: { name: "Organization Owner" } },
        });
        if (owners <= 1) throw new Error("LAST_OWNER");
      }
      await tx.organizationMember.update({ where: { id: member.id }, data: { status: "SUSPENDED" } });
      await logAuditEvent({
        organizationId: tenant.organizationId,
        userId: tenant.userId,
        membershipId: member.id,
        module: "administration",
        action: "member.deactivated",
        entityName: "OrganizationMember",
        entityId: member.id,
        metadata: { affectedUserId: member.userId, releasedSeatsImmediately: true },
      }, tx);
    });
  } catch (error) {
    if (error instanceof Error && error.message === "LAST_OWNER") redirect("/app/administration?error=last-owner");
    if (error instanceof Error && error.message === "MEMBER_NOT_FOUND") redirect("/app/administration?error=not-found");
    throw error;
  }
  revalidatePath("/app/administration");
  revalidatePath("/app/organization/billing");
  redirect("/app/administration?deactivated=1");
}

export async function reactivateMember(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.ORG_SETTINGS_MANAGE)) redirect("/app/administration?error=forbidden");
  const membershipId = clean(formData.get("membershipId"));
  if (!membershipId) redirect("/app/administration?error=missing-fields");
  const candidate = await db.organizationMember.findFirst({
    where: { id: membershipId, organizationId: tenant.organizationId, status: "SUSPENDED" },
    select: { roleId: true },
  });
  if (!candidate?.roleId) redirect("/app/administration?error=not-found");
  const role = await getAssignableRole(tenant.organizationId, tenant.enabledModuleKeys, candidate.roleId);
  if (!role) redirect("/app/administration?error=invalid-role");

  try {
    await db.$transaction(async (tx) => {
      const member = await tx.organizationMember.findFirst({
        where: { id: membershipId, organizationId: tenant.organizationId, status: "SUSPENDED" },
      });
      if (!member?.roleId || member.roleId !== role.id) throw new Error("MEMBER_NOT_FOUND");
      await assertRoleHasAvailableSeats(tx, tenant.organizationId, role.id, member.id);
      await tx.organizationMember.update({ where: { id: member.id }, data: { status: "ACTIVE" } });
      await logAuditEvent({
        organizationId: tenant.organizationId,
        userId: tenant.userId,
        membershipId: member.id,
        module: "administration",
        action: "member.reactivated",
        entityName: "OrganizationMember",
        entityId: member.id,
        metadata: { affectedUserId: member.userId },
      }, tx);
    });
  } catch (error) {
    if (error instanceof SeatLimitExceededError) redirect("/app/administration?error=seat-limit");
    if (error instanceof Error && error.message === "MEMBER_NOT_FOUND") redirect("/app/administration?error=not-found");
    throw error;
  }
  revalidatePath("/app/administration");
  revalidatePath("/app/organization/billing");
  redirect("/app/administration?reactivated=1");
}

export async function resendMemberInvitation(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.ORG_SETTINGS_MANAGE)) {
    redirect("/app/administration?error=forbidden");
  }

  const membershipId = clean(formData.get("membershipId"));
  if (!membershipId) return;

  const member = await db.organizationMember.findFirst({
    where: { id: membershipId, organizationId: tenant.organizationId },
    include: { user: true, role: true },
  });
  if (!member) redirect("/app/administration?error=not-found");

  const session = await getServerAuthSession();
  let token: string;
  try {
    token = await resendInvitation(tenant.organizationId, membershipId);
  } catch (error) {
    if (error instanceof InvitationError) redirect("/app/administration?error=resend-failed");
    throw error;
  }
  await logAuditEvent({
    organizationId: tenant.organizationId,
    userId: session?.user?.id,
    membershipId,
    module: "administration",
    action: "invitation.resent",
    entityName: "OrganizationMember",
    entityId: membershipId,
  });

  const inviteUrl = buildTenantAppUrl("/invite", { token });
  const result = await sendEmail({ to: member!.user.email, ...invitationEmail({ organizationName: tenant.organization.name, roleName: member!.role?.name ?? "a member", inviteUrl, reminder: true }) });

  if (!result.ok) {
    await markInvitationDeliveryFailed(membershipId);
    revalidatePath("/app/administration");
    redirect("/app/administration?error=delivery-failed");
  }

  revalidatePath("/app/administration");
  redirect("/app/administration?invited=1");
}

export async function revokeMemberInvitation(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.ORG_SETTINGS_MANAGE)) {
    redirect("/app/administration?error=forbidden");
  }

  const membershipId = clean(formData.get("membershipId"));
  if (!membershipId) return;

  try {
    await revokeInvitation(tenant.organizationId, membershipId);
  } catch (error) {
    if (error instanceof InvitationError) redirect("/app/administration?error=resend-failed");
    throw error;
  }

  const session = await getServerAuthSession();
  await logAuditEvent({
    organizationId: tenant.organizationId,
    userId: session?.user?.id,
    membershipId,
    module: "administration",
    action: "invitation.revoked",
    entityName: "OrganizationMember",
    entityId: membershipId,
  });

  revalidatePath("/app/administration");
  redirect("/app/administration?revoked=1");
}

export async function removeMember(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.ORG_SETTINGS_MANAGE)) {
    redirect("/app/administration?error=forbidden");
  }
  const membershipId = clean(formData.get("membershipId"));
  const member = await db.organizationMember.findFirst({
    where: { id: membershipId, organizationId: tenant.organizationId },
    include: { role: true },
  });
  if (!member) redirect("/app/administration?error=not-found");
  if (member.userId === tenant.userId) redirect("/app/administration?error=self-remove");

  if (member.role?.name === "Organization Owner" && member.status === "ACTIVE") {
    const owners = await db.organizationMember.count({
      where: { organizationId: tenant.organizationId, status: "ACTIVE", role: { name: "Organization Owner" } },
    });
    if (owners <= 1) redirect("/app/administration?error=last-owner");
  }

  await db.$transaction(async (tx) => {
    await tx.organizationMember.update({ where: { id: member.id }, data: { status: "REMOVED" } });
    await tx.invitation.updateMany({
      where: { membershipId: member.id, status: "PENDING" },
      data: { status: "REVOKED" },
    });
    await logAuditEvent({
      organizationId: tenant.organizationId,
      userId: tenant.userId,
      membershipId: member.id,
      module: "administration",
      action: "member.removed",
      entityName: "OrganizationMember",
      entityId: member.id,
      metadata: { removedUserId: member.userId },
    }, tx);
  });
  revalidatePath("/app/administration");
  redirect("/app/administration?removed=1");
}
