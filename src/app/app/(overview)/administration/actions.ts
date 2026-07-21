"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { issueInviteToken } from "@/lib/auth/tokens";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

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

  await db.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { email },
      update: {},
      create: { email, name, status: "INVITED" },
    });

    const membership = await tx.organizationMember.upsert({
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
        entityId: membership.id,
        changes: { email, role: role.name },
      },
    });
  });

  const token = await issueInviteToken(email);
  const inviteUrl = `${siteUrl}/invite?email=${encodeURIComponent(email)}&token=${token}`;

  await sendEmail({
    to: email,
    subject: `You've been invited to join ${tenant.organization.name} on Rock Frost Business Suite`,
    html: `<p>You've been invited to join <strong>${tenant.organization.name}</strong> as ${role.name}.</p><p><a href="${inviteUrl}">Accept the invitation</a></p><p>This link expires in 7 days.</p>`,
  });

  redirect("/app/administration?invited=1");
}
