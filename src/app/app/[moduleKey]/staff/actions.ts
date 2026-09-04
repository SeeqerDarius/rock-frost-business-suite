"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission } from "@/lib/auth/permissions";
import { email as emailSchema, parseWithSchema, shortText } from "@/lib/validation";
import { isPlatformUser } from "@/lib/auth/platform-identity";
import { assertRoleHasAvailableSeats, SeatLimitExceededError } from "@/platform/subscriptions/seats";
import { createInvitation, markInvitationDeliveryFailed } from "@/lib/auth/invitations";
import { buildTenantAppUrl } from "@/lib/app-url";
import { invitationEmail } from "@/lib/email-templates";
import { sendEmail } from "@/lib/email";
import { logAuditEvent } from "@/lib/audit";
import { ensureHrEmployeeForUser } from "@/modules/hr/service";
import { getModuleTeamConfig, type ModuleTeamConfig } from "@/modules/staff/module-team-config";

async function authorize(moduleKey: string) {
  const config = getModuleTeamConfig(moduleKey);
  if (!config) redirect("/app/modules?error=module-unavailable");
  const tenant = await requireModuleAccess(config.key);
  const path = `/app/${config.key}/staff`;
  if (!hasPermission(tenant, config.managePermission)) redirect(`${path}?error=forbidden`);
  return { tenant, config, path };
}

function findRole(organizationId: string, roleId: string, config: ModuleTeamConfig) {
  return db.role.findFirst({
    where: { id: roleId, name: { in: [...config.roleNames] }, OR: [{ organizationId }, { isSystem: true }] },
  });
}

export async function addModuleStaffAction(formData: FormData) {
  const parsed = parseWithSchema(z.object({ moduleKey: z.string(), name: shortText, email: emailSchema, roleId: z.string().cuid() }), Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/modules?error=invalid");
  const { tenant, config, path } = await authorize(parsed.data.moduleKey);
  const role = await findRole(tenant.organizationId, parsed.data.roleId, config);
  if (!role) redirect(`${path}?error=invalid-role`);
  const existingUser = await db.user.findUnique({ where: { email: parsed.data.email }, select: { id: true } });
  if (existingUser && await isPlatformUser(existingUser.id)) redirect(`${path}?error=invalid-user`);

  let membership;
  try {
    membership = await db.$transaction(async (tx) => {
      const user = await tx.user.upsert({ where: { email: parsed.data.email }, update: {}, create: { email: parsed.data.email, name: parsed.data.name, status: "INVITED" } });
      const existing = await tx.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: tenant.organizationId, userId: user.id } }, select: { id: true, status: true } });
      if (existing?.status === "ACTIVE") throw new Error("ALREADY_ACTIVE");
      await assertRoleHasAvailableSeats(tx, tenant.organizationId, role.id, existing?.id);
      const member = await tx.organizationMember.upsert({ where: { organizationId_userId: { organizationId: tenant.organizationId, userId: user.id } }, update: { roleId: role.id, status: "INVITED" }, create: { organizationId: tenant.organizationId, userId: user.id, roleId: role.id, status: "INVITED" } });
      await logAuditEvent({ organizationId: tenant.organizationId, userId: tenant.userId, membershipId: member.id, module: config.key, action: "staff.invited", entityName: "OrganizationMember", entityId: member.id, metadata: { roleName: role.name } }, tx);
      return member;
    });
  } catch (error) {
    if (error instanceof SeatLimitExceededError) redirect(`${path}?error=seat-limit`);
    if (error instanceof Error && error.message === "ALREADY_ACTIVE") redirect(`${path}?error=already-active`);
    throw error;
  }
  const token = await createInvitation({ organizationId: tenant.organizationId, membershipId: membership.id, email: parsed.data.email, createdById: tenant.userId });
  const delivery = await sendEmail({ to: parsed.data.email, ...invitationEmail({ organizationName: tenant.organization.name, roleName: role.name, inviteUrl: buildTenantAppUrl("/invite", { token }) }) });
  if (!delivery.ok) { await markInvitationDeliveryFailed(membership.id); redirect(`${path}?error=delivery-failed`); }
  revalidatePath(path);
  redirect(`${path}?invited=1`);
}

export async function updateModuleStaffAction(formData: FormData) {
  const parsed = z.object({ moduleKey: z.string(), membershipId: z.string().cuid(), roleId: z.string().cuid(), status: z.enum(["ACTIVE", "SUSPENDED"]) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/modules?error=invalid");
  const { tenant, config, path } = await authorize(parsed.data.moduleKey);
  const role = await findRole(tenant.organizationId, parsed.data.roleId, config);
  if (!role) redirect(`${path}?error=invalid-role`);
  try {
    await db.$transaction(async (tx) => {
      const member = await tx.organizationMember.findFirst({ where: { id: parsed.data.membershipId, organizationId: tenant.organizationId, role: { name: { in: [...config.roleNames] } }, status: { in: ["ACTIVE", "SUSPENDED"] } } });
      if (!member || member.userId === tenant.userId) throw new Error("NOT_FOUND");
      if (parsed.data.status === "ACTIVE") await assertRoleHasAvailableSeats(tx, tenant.organizationId, role.id, member.id);
      await tx.organizationMember.update({ where: { id: member.id }, data: { roleId: role.id, status: parsed.data.status } });
      if (parsed.data.status === "ACTIVE") await ensureHrEmployeeForUser(tx, tenant.organizationId, member.userId, role.name, { branchId: member.branchId, joinedAt: member.joinedAt, actorId: tenant.userId, membershipId: member.id });
      await logAuditEvent({ organizationId: tenant.organizationId, userId: tenant.userId, membershipId: member.id, module: config.key, action: "staff.updated", entityName: "OrganizationMember", entityId: member.id, metadata: { roleName: role.name, status: parsed.data.status } }, tx);
    });
  } catch (error) {
    if (error instanceof SeatLimitExceededError) redirect(`${path}?error=seat-limit`);
    if (error instanceof Error && error.message === "NOT_FOUND") redirect(`${path}?error=not-found`);
    throw error;
  }
  revalidatePath(path);
  redirect(`${path}?saved=1`);
}
