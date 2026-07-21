"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { createInvitation, resendInvitation, revokeInvitation, markInvitationDeliveryFailed, InvitationError } from "@/lib/auth/invitations";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

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

export async function inviteMember(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.ORG_SETTINGS_MANAGE)) {
    redirect("/app/administration?error=forbidden");
  }

  const name = clean(formData.get("name"));
  const email = clean(formData.get("email")).toLowerCase();
  const roleId = clean(formData.get("roleId"));

  if (!name || !email || !roleId) {
    redirect("/app/administration?error=missing-fields");
  }

  const role = await db.role.findFirst({
    where: { id: roleId, OR: [{ organizationId: tenant.organizationId }, { isSystem: true }] },
  });
  if (!role || NOT_INVITABLE_ROLES.has(role.name)) {
    redirect("/app/administration?error=invalid-role");
  }

  const session = await getServerAuthSession();

  const membership = await db.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { email },
      update: {},
      create: { email, name, status: "INVITED" },
    });

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

    await tx.auditLog.create({
      data: {
        organizationId: tenant.organizationId,
        userId: session?.user?.id,
        action: "member.invited",
        entityName: "OrganizationMember",
        entityId: member.id,
        changes: { email, role: role.name },
      },
    });

    return member;
  });

  const token = await createInvitation({
    organizationId: tenant.organizationId,
    membershipId: membership.id,
    email,
    createdById: session?.user?.id ?? null,
  });
  const inviteUrl = `${siteUrl}/invite?token=${token}`;

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

  let token: string;
  try {
    token = await resendInvitation(tenant.organizationId, membershipId);
  } catch (error) {
    if (error instanceof InvitationError) redirect("/app/administration?error=resend-failed");
    throw error;
  }

  const inviteUrl = `${siteUrl}/invite?token=${token}`;
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

  revalidatePath("/app/administration");
  redirect("/app/administration?revoked=1");
}
