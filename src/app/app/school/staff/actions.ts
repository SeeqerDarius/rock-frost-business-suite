"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { email as emailSchema, parseWithSchema, shortText } from "@/lib/validation";
import { isPlatformUser } from "@/lib/auth/platform-identity";
import { assertRoleHasAvailableSeats, SeatLimitExceededError } from "@/platform/subscriptions/seats";
import { createInvitation, markInvitationDeliveryFailed } from "@/lib/auth/invitations";
import { buildTenantAppUrl } from "@/lib/app-url";
import { invitationEmail } from "@/lib/email-templates";
import { sendEmail } from "@/lib/email";
import { logAuditEvent } from "@/lib/audit";
import { ensureHrEmployeeForUser } from "@/modules/hr/service";
import { SCHOOL_STAFF_ROLE_NAMES } from "@/modules/school/staff-roles";

const PATH = "/app/school/staff";

async function authorize() {
  const tenant = await requireModuleAccess("school");
  if (!hasPermission(tenant, PERMISSIONS.SCHOOL_STAFF_MANAGE)) redirect(`${PATH}?error=forbidden`);
  return tenant;
}

async function schoolRole(organizationId: string, roleId: string) {
  return db.role.findFirst({
    where: { id: roleId, name: { in: [...SCHOOL_STAFF_ROLE_NAMES] }, OR: [{ organizationId }, { isSystem: true }] },
    include: { rolePermissions: { include: { permission: true } } },
  });
}

export async function addSchoolStaffAction(formData: FormData) {
  const tenant = await authorize();
  const parsed = parseWithSchema(z.object({ name: shortText, email: emailSchema, roleId: z.string().cuid() }), Object.fromEntries(formData));
  if (!parsed.success) redirect(`${PATH}?error=invalid`);
  const role = await schoolRole(tenant.organizationId, parsed.data.roleId);
  if (!role) redirect(`${PATH}?error=invalid-role`);
  const existingUser = await db.user.findUnique({ where: { email: parsed.data.email }, select: { id: true } });
  if (existingUser && await isPlatformUser(existingUser.id)) redirect(`${PATH}?error=invalid-user`);

  let membership;
  try {
    membership = await db.$transaction(async (tx) => {
      const user = await tx.user.upsert({ where: { email: parsed.data.email }, update: {}, create: { email: parsed.data.email, name: parsed.data.name, status: "INVITED" } });
      const existing = await tx.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: tenant.organizationId, userId: user.id } }, select: { id: true, status: true } });
      if (existing?.status === "ACTIVE") throw new Error("ALREADY_ACTIVE");
      await assertRoleHasAvailableSeats(tx, tenant.organizationId, role.id, existing?.id);
      const member = await tx.organizationMember.upsert({
        where: { organizationId_userId: { organizationId: tenant.organizationId, userId: user.id } },
        update: { roleId: role.id, status: "INVITED" },
        create: { organizationId: tenant.organizationId, userId: user.id, roleId: role.id, status: "INVITED" },
      });
      await logAuditEvent({ organizationId: tenant.organizationId, userId: tenant.userId, membershipId: member.id, module: "school", action: "staff.invited", entityName: "OrganizationMember", entityId: member.id, metadata: { roleName: role.name } }, tx);
      return member;
    });
  } catch (error) {
    if (error instanceof SeatLimitExceededError) redirect(`${PATH}?error=seat-limit`);
    if (error instanceof Error && error.message === "ALREADY_ACTIVE") redirect(`${PATH}?error=already-active`);
    throw error;
  }

  const token = await createInvitation({ organizationId: tenant.organizationId, membershipId: membership.id, email: parsed.data.email, createdById: tenant.userId });
  const inviteUrl = buildTenantAppUrl("/invite", { token });
  const delivery = await sendEmail({ to: parsed.data.email, ...invitationEmail({ organizationName: tenant.organization.name, roleName: role.name, inviteUrl }) });
  if (!delivery.ok) { await markInvitationDeliveryFailed(membership.id); redirect(`${PATH}?error=delivery-failed`); }
  revalidatePath(PATH);
  redirect(`${PATH}?invited=1`);
}

export async function updateSchoolStaffAction(formData: FormData) {
  const tenant = await authorize();
  const parsed = z.object({ membershipId: z.string().cuid(), roleId: z.string().cuid(), status: z.enum(["ACTIVE", "SUSPENDED"]) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`${PATH}?error=invalid`);
  const role = await schoolRole(tenant.organizationId, parsed.data.roleId);
  if (!role) redirect(`${PATH}?error=invalid-role`);
  try {
    await db.$transaction(async (tx) => {
      const member = await tx.organizationMember.findFirst({ where: { id: parsed.data.membershipId, organizationId: tenant.organizationId, role: { name: { in: [...SCHOOL_STAFF_ROLE_NAMES] } }, status: { in: ["ACTIVE", "SUSPENDED"] } } });
      if (!member || member.userId === tenant.userId) throw new Error("NOT_FOUND");
      if (parsed.data.status === "ACTIVE") await assertRoleHasAvailableSeats(tx, tenant.organizationId, role.id, member.id);
      await tx.organizationMember.update({ where: { id: member.id }, data: { roleId: role.id, status: parsed.data.status } });
      if (parsed.data.status === "ACTIVE") await ensureHrEmployeeForUser(tx, tenant.organizationId, member.userId, role.name, { branchId: member.branchId, joinedAt: member.joinedAt, actorId: tenant.userId, membershipId: member.id });
      await logAuditEvent({ organizationId: tenant.organizationId, userId: tenant.userId, membershipId: member.id, module: "school", action: "staff.updated", entityName: "OrganizationMember", entityId: member.id, metadata: { roleName: role.name, status: parsed.data.status } }, tx);
    });
  } catch (error) {
    if (error instanceof SeatLimitExceededError) redirect(`${PATH}?error=seat-limit`);
    if (error instanceof Error && error.message === "NOT_FOUND") redirect(`${PATH}?error=not-found`);
    throw error;
  }
  revalidatePath(PATH);
  revalidatePath("/app/school/classes");
  redirect(`${PATH}?saved=1`);
}
