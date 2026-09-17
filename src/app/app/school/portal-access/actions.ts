"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { email as emailSchema, cuid, parseWithSchema } from "@/lib/validation";
import { isPlatformUser } from "@/lib/auth/platform-identity";
import { createInvitation, markInvitationDeliveryFailed } from "@/lib/auth/invitations";
import { buildTenantAppUrl } from "@/lib/app-url";
import { invitationEmail } from "@/lib/email-templates";
import { sendEmail } from "@/lib/email";
import { logAuditEvent } from "@/lib/audit";

const PATH = "/app/school/portal-access";

async function authorize() {
  const tenant = await requireModuleAccess("school");
  if (!hasPermission(tenant, PERMISSIONS.SCHOOL_STUDENTS_MANAGE)) redirect(`${PATH}?error=forbidden`);
  return tenant;
}

async function portalRole(organizationId: string, name: "Parent" | "Student") {
  return db.role.findFirst({ where: { name, OR: [{ organizationId }, { isSystem: true }] } });
}

/**
 * Portal accounts are never seat-limited (see the comment beside the
 * Parent/Student entries in prisma/seed-data.ts) - a school could have
 * hundreds of guardians, and billing them like staff seats would be a
 * real product/pricing decision this feature doesn't make on its own.
 */
async function upsertPortalMember(organizationId: string, roleId: string, email: string, name: string) {
  return db.$transaction(async (tx) => {
    const user = await tx.user.upsert({ where: { email }, update: {}, create: { email, name, status: "INVITED" } });
    const existing = await tx.organizationMember.findUnique({ where: { organizationId_userId: { organizationId, userId: user.id } }, select: { id: true, status: true } });
    if (existing?.status === "ACTIVE") throw new Error("ALREADY_ACTIVE");
    const member = await tx.organizationMember.upsert({
      where: { organizationId_userId: { organizationId, userId: user.id } },
      update: { roleId, status: "INVITED" },
      create: { organizationId, userId: user.id, roleId, status: "INVITED" },
    });
    return { user, member };
  });
}

async function sendPortalInvite(organizationId: string, membershipId: string, email: string, roleName: string, createdById: string) {
  const tenant = await db.organization.findUnique({ where: { id: organizationId }, select: { name: true } });
  const token = await createInvitation({ organizationId, membershipId, email, createdById });
  const inviteUrl = buildTenantAppUrl("/invite", { token });
  return sendEmail({ to: email, ...invitationEmail({ organizationName: tenant?.name ?? "your school", roleName, inviteUrl }) });
}

export async function inviteGuardianToPortalAction(formData: FormData) {
  const tenant = await authorize();
  const parsed = z.object({ guardianId: cuid }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`${PATH}?error=invalid`);
  const guardian = await db.schoolGuardian.findFirst({ where: { id: parsed.data.guardianId, organizationId: tenant.organizationId } });
  if (!guardian) redirect(`${PATH}?error=not-found`);
  if (guardian.userId) redirect(`${PATH}?error=already-linked`);
  if (!guardian.email) redirect(`${PATH}?error=guardian-no-email`);

  const role = await portalRole(tenant.organizationId, "Parent");
  if (!role) redirect(`${PATH}?error=invalid`);

  const existingUser = await db.user.findUnique({ where: { email: guardian.email }, select: { id: true } });
  if (existingUser && (await isPlatformUser(existingUser.id))) redirect(`${PATH}?error=invalid-user`);

  let outcome;
  try {
    outcome = await upsertPortalMember(tenant.organizationId, role.id, guardian.email, `${guardian.firstName} ${guardian.lastName}`);
  } catch (error) {
    if (error instanceof Error && error.message === "ALREADY_ACTIVE") redirect(`${PATH}?error=already-active`);
    throw error;
  }
  await db.schoolGuardian.update({ where: { id: guardian.id }, data: { userId: outcome.user.id } });
  await logAuditEvent({ organizationId: tenant.organizationId, userId: tenant.userId, membershipId: outcome.member.id, module: "school", action: "portal.guardian_invited", entityName: "SchoolGuardian", entityId: guardian.id });

  const delivery = await sendPortalInvite(tenant.organizationId, outcome.member.id, guardian.email, "Parent", tenant.userId);
  if (!delivery.ok) { await markInvitationDeliveryFailed(outcome.member.id); redirect(`${PATH}?error=delivery-failed`); }
  revalidatePath(PATH);
  redirect(`${PATH}?invited=1`);
}

export async function inviteStudentToPortalAction(formData: FormData) {
  const tenant = await authorize();
  const parsed = parseWithSchema(z.object({ studentId: cuid, email: emailSchema }), Object.fromEntries(formData));
  if (!parsed.success) redirect(`${PATH}?error=invalid`);
  const student = await db.schoolStudent.findFirst({ where: { id: parsed.data.studentId, organizationId: tenant.organizationId } });
  if (!student) redirect(`${PATH}?error=not-found`);
  if (student.userId) redirect(`${PATH}?error=already-linked`);

  const role = await portalRole(tenant.organizationId, "Student");
  if (!role) redirect(`${PATH}?error=invalid`);

  const existingUser = await db.user.findUnique({ where: { email: parsed.data.email }, select: { id: true } });
  if (existingUser && (await isPlatformUser(existingUser.id))) redirect(`${PATH}?error=invalid-user`);

  let outcome;
  try {
    outcome = await upsertPortalMember(tenant.organizationId, role.id, parsed.data.email, `${student.firstName} ${student.lastName}`);
  } catch (error) {
    if (error instanceof Error && error.message === "ALREADY_ACTIVE") redirect(`${PATH}?error=already-active`);
    throw error;
  }
  await db.schoolStudent.update({ where: { id: student.id }, data: { userId: outcome.user.id } });
  await logAuditEvent({ organizationId: tenant.organizationId, userId: tenant.userId, membershipId: outcome.member.id, module: "school", action: "portal.student_invited", entityName: "SchoolStudent", entityId: student.id });

  const delivery = await sendPortalInvite(tenant.organizationId, outcome.member.id, parsed.data.email, "Student", tenant.userId);
  if (!delivery.ok) { await markInvitationDeliveryFailed(outcome.member.id); redirect(`${PATH}?error=delivery-failed`); }
  revalidatePath(PATH);
  redirect(`${PATH}?invited=1`);
}

export async function revokePortalAccessAction(formData: FormData) {
  const tenant = await authorize();
  const parsed = z.object({ kind: z.enum(["guardian", "student"]), recordId: cuid }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`${PATH}?error=invalid`);

  if (parsed.data.kind === "guardian") {
    const guardian = await db.schoolGuardian.findFirst({ where: { id: parsed.data.recordId, organizationId: tenant.organizationId } });
    if (!guardian?.userId) redirect(`${PATH}?error=not-found`);
    await db.$transaction([
      db.schoolGuardian.update({ where: { id: guardian.id }, data: { userId: null } }),
      db.organizationMember.updateMany({ where: { organizationId: tenant.organizationId, userId: guardian.userId, role: { name: "Parent" } }, data: { status: "SUSPENDED" } }),
    ]);
  } else {
    const student = await db.schoolStudent.findFirst({ where: { id: parsed.data.recordId, organizationId: tenant.organizationId } });
    if (!student?.userId) redirect(`${PATH}?error=not-found`);
    await db.$transaction([
      db.schoolStudent.update({ where: { id: student.id }, data: { userId: null } }),
      db.organizationMember.updateMany({ where: { organizationId: tenant.organizationId, userId: student.userId, role: { name: "Student" } }, data: { status: "SUSPENDED" } }),
    ]);
  }
  await logAuditEvent({ organizationId: tenant.organizationId, userId: tenant.userId, module: "school", action: "portal.access_revoked", entityName: parsed.data.kind === "guardian" ? "SchoolGuardian" : "SchoolStudent", entityId: parsed.data.recordId });
  revalidatePath(PATH);
  redirect(`${PATH}?saved=1`);
}
