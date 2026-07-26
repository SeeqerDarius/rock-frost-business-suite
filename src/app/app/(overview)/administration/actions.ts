"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { createInvitation, resendInvitation, revokeInvitation, markInvitationDeliveryFailed, InvitationError } from "@/lib/auth/invitations";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import { shortText, email as emailSchema, parseWithSchema } from "@/lib/validation";
import { logAuditEvent } from "@/lib/audit";
import { buildTenantAppUrl } from "@/lib/app-url";
import { isPlatformUser } from "@/lib/auth/platform-identity";

function inviteEmailHtml(organizationName: string, roleName: string, inviteUrl: string) {
  return `<p>You've been invited to join <strong>${organizationName}</strong> as ${roleName}.</p><p><a href="${inviteUrl}">Accept the invitation</a></p><p>This link expires in 7 days.</p>`;
}

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

  const role = await db.role.findFirst({
    where: { id: roleId, OR: [{ organizationId: tenant.organizationId }, { isSystem: true }] },
  });
  if (!role || NOT_INVITABLE_ROLES.has(role.name)) {
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
    throw error;
  }

  const token = await createInvitation({
    organizationId: tenant.organizationId,
    membershipId: membership.id,
    email,
    createdById: session?.user?.id ?? null,
  });
  const inviteUrl = buildTenantAppUrl("/invite", { token });

  const result = await sendEmail({
    to: email,
    subject: `You've been invited to join ${tenant.organization.name} on Rock Frost Business Suite`,
    html: inviteEmailHtml(tenant.organization.name, role.name, inviteUrl),
  });

  if (!result.ok) {
    await markInvitationDeliveryFailed(membership.id);
    revalidatePath("/app/administration");
    redirect("/app/administration?error=delivery-failed");
  }

  revalidatePath("/app/administration");
  redirect("/app/administration?invited=1");
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
  const result = await sendEmail({
    to: member!.user.email,
    subject: `Reminder: you've been invited to join ${tenant.organization.name} on Rock Frost Business Suite`,
    html: inviteEmailHtml(tenant.organization.name, member!.role?.name ?? "a member", inviteUrl),
  });

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
