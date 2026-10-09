"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { email as emailSchema, cuid, parseWithSchema } from "@/lib/validation";
import { isPlatformUser } from "@/lib/auth/platform-identity";
import { createInvitation, markInvitationDeliveryFailed, resendInvitation, InvitationError } from "@/lib/auth/invitations";
import { buildTenantAppUrl } from "@/lib/app-url";
import { invitationEmail } from "@/lib/email-templates";
import { sendEmail } from "@/lib/email";
import { logAuditEvent } from "@/lib/audit";
import { isSchoolPortalGranted } from "@/lib/platform-communications";

const PATH = "/app/school/portal-access";

function portalAccessRedirect(formData: FormData, key?: string, value?: string) {
  const params = new URLSearchParams();
  const classId = cuid.safeParse(formData.get("returnClassId"));
  const group = formData.get("returnGroup");
  const query = z.string().max(100).safeParse(formData.get("returnQuery"));
  if (classId.success) params.set("classId", classId.data);
  else if (group === "unassigned") params.set("group", "unassigned");
  if (query.success && query.data.trim()) params.set("q", query.data.trim());
  if (key && value) params.set(key, value);
  const suffix = params.toString();
  return suffix ? `${PATH}?${suffix}` : PATH;
}

async function authorize() {
  const tenant = await requireModuleAccess("school");
  if (!hasPermission(tenant, PERMISSIONS.SCHOOL_STUDENTS_MANAGE)) redirect(`${PATH}?error=forbidden`);
  return tenant;
}

/** Invites (unlike a revoke) must be blocked server-side, not just hidden in
 * the UI, if a platform operator hasn't granted this paid add-on to the
 * organization - see docs/SCHOOL_PARENT_STUDENT_PORTAL.md. */
async function authorizeInvite() {
  const tenant = await authorize();
  if (!(await isSchoolPortalGranted(tenant.organizationId))) redirect(`${PATH}?error=not-granted`);
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
  const tenant = await authorizeInvite();
  const parsed = z.object({ guardianId: cuid }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(portalAccessRedirect(formData, "error", "invalid"));
  const guardian = await db.schoolGuardian.findFirst({ where: { id: parsed.data.guardianId, organizationId: tenant.organizationId } });
  if (!guardian) redirect(portalAccessRedirect(formData, "error", "not-found"));
  if (guardian.userId) redirect(portalAccessRedirect(formData, "error", "already-linked"));
  if (!guardian.email) redirect(portalAccessRedirect(formData, "error", "guardian-no-email"));

  const role = await portalRole(tenant.organizationId, "Parent");
  if (!role) redirect(portalAccessRedirect(formData, "error", "invalid"));

  const existingUser = await db.user.findUnique({ where: { email: guardian.email }, select: { id: true } });
  if (existingUser && (await isPlatformUser(existingUser.id))) redirect(portalAccessRedirect(formData, "error", "invalid-user"));

  let outcome;
  try {
    outcome = await upsertPortalMember(tenant.organizationId, role.id, guardian.email, `${guardian.firstName} ${guardian.lastName}`);
  } catch (error) {
    if (error instanceof Error && error.message === "ALREADY_ACTIVE") redirect(portalAccessRedirect(formData, "error", "already-active"));
    throw error;
  }
  await db.schoolGuardian.update({ where: { id: guardian.id }, data: { userId: outcome.user.id } });
  await logAuditEvent({ organizationId: tenant.organizationId, userId: tenant.userId, membershipId: outcome.member.id, module: "school", action: "portal.guardian_invited", entityName: "SchoolGuardian", entityId: guardian.id });

  const delivery = await sendPortalInvite(tenant.organizationId, outcome.member.id, guardian.email, "Parent", tenant.userId);
  if (!delivery.ok) { await markInvitationDeliveryFailed(outcome.member.id); redirect(portalAccessRedirect(formData, "error", "delivery-failed")); }
  revalidatePath(PATH);
  redirect(portalAccessRedirect(formData, "invited", "1"));
}

export async function inviteStudentToPortalAction(formData: FormData) {
  const tenant = await authorizeInvite();
  const parsed = parseWithSchema(z.object({ studentId: cuid, email: emailSchema }), Object.fromEntries(formData));
  if (!parsed.success) redirect(portalAccessRedirect(formData, "error", "invalid"));
  const student = await db.schoolStudent.findFirst({ where: { id: parsed.data.studentId, organizationId: tenant.organizationId } });
  if (!student) redirect(portalAccessRedirect(formData, "error", "not-found"));
  if (student.userId) redirect(portalAccessRedirect(formData, "error", "already-linked"));

  const role = await portalRole(tenant.organizationId, "Student");
  if (!role) redirect(portalAccessRedirect(formData, "error", "invalid"));

  const existingUser = await db.user.findUnique({ where: { email: parsed.data.email }, select: { id: true } });
  if (existingUser && (await isPlatformUser(existingUser.id))) redirect(portalAccessRedirect(formData, "error", "invalid-user"));

  let outcome;
  try {
    outcome = await upsertPortalMember(tenant.organizationId, role.id, parsed.data.email, `${student.firstName} ${student.lastName}`);
  } catch (error) {
    if (error instanceof Error && error.message === "ALREADY_ACTIVE") redirect(portalAccessRedirect(formData, "error", "already-active"));
    throw error;
  }
  await db.schoolStudent.update({ where: { id: student.id }, data: { userId: outcome.user.id } });
  await logAuditEvent({ organizationId: tenant.organizationId, userId: tenant.userId, membershipId: outcome.member.id, module: "school", action: "portal.student_invited", entityName: "SchoolStudent", entityId: student.id });

  const delivery = await sendPortalInvite(tenant.organizationId, outcome.member.id, parsed.data.email, "Student", tenant.userId);
  if (!delivery.ok) { await markInvitationDeliveryFailed(outcome.member.id); redirect(portalAccessRedirect(formData, "error", "delivery-failed")); }
  revalidatePath(PATH);
  redirect(portalAccessRedirect(formData, "invited", "1"));
}

export async function resendPortalInvitationAction(formData: FormData) {
  const tenant = await authorizeInvite();
  const parsed = z.object({ kind: z.enum(["guardian", "student"]), recordId: cuid }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(portalAccessRedirect(formData, "error", "invalid"));

  const record = parsed.data.kind === "guardian"
    ? await db.schoolGuardian.findFirst({ where: { id: parsed.data.recordId, organizationId: tenant.organizationId }, select: { userId: true } })
    : await db.schoolStudent.findFirst({ where: { id: parsed.data.recordId, organizationId: tenant.organizationId }, select: { userId: true } });
  if (!record?.userId) redirect(portalAccessRedirect(formData, "error", "not-found"));

  const roleName = parsed.data.kind === "guardian" ? "Parent" : "Student";
  const member = await db.organizationMember.findFirst({
    where: { organizationId: tenant.organizationId, userId: record.userId, status: "INVITED", role: { name: roleName } },
    include: { user: true, invitation: true },
  });
  if (!member || member.invitation?.status !== "PENDING") redirect(portalAccessRedirect(formData, "error", "resend-unavailable"));

  let token: string;
  try {
    token = await resendInvitation(tenant.organizationId, member.id);
  } catch (error) {
    if (error instanceof InvitationError) redirect(portalAccessRedirect(formData, "error", "resend-unavailable"));
    throw error;
  }
  await logAuditEvent({ organizationId: tenant.organizationId, userId: tenant.userId, membershipId: member.id, module: "school", action: "portal.invitation_resent", entityName: parsed.data.kind === "guardian" ? "SchoolGuardian" : "SchoolStudent", entityId: parsed.data.recordId });
  const inviteUrl = buildTenantAppUrl("/invite", { token });
  const delivery = await sendEmail({ to: member.user.email, ...invitationEmail({ organizationName: tenant.organization.name, roleName, inviteUrl, reminder: true }) });
  if (!delivery.ok) {
    await markInvitationDeliveryFailed(member.id);
    redirect(portalAccessRedirect(formData, "error", "delivery-failed"));
  }
  revalidatePath(PATH);
  redirect(portalAccessRedirect(formData, "invited", "1"));
}

export async function revokePortalAccessAction(formData: FormData) {
  const tenant = await authorize();
  const parsed = z.object({ kind: z.enum(["guardian", "student"]), recordId: cuid }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(portalAccessRedirect(formData, "error", "invalid"));

  try {
    await db.$transaction(async (tx) => {
      const record = parsed.data.kind === "guardian"
        ? await tx.schoolGuardian.findFirst({ where: { id: parsed.data.recordId, organizationId: tenant.organizationId }, select: { id: true, userId: true } })
        : await tx.schoolStudent.findFirst({ where: { id: parsed.data.recordId, organizationId: tenant.organizationId }, select: { id: true, userId: true } });
      if (!record?.userId) throw new Error("NOT_FOUND");

      const roleName = parsed.data.kind === "guardian" ? "Parent" : "Student";
      const member = await tx.organizationMember.findFirst({ where: { organizationId: tenant.organizationId, userId: record.userId, role: { name: roleName } }, select: { id: true, status: true } });
      if (member?.status === "INVITED") {
        const revoked = await tx.invitation.updateMany({ where: { membershipId: member.id, status: "PENDING" }, data: { status: "REVOKED" } });
        if (revoked.count === 0) throw new Error("INVITATION_NOT_PENDING");
        const removed = await tx.organizationMember.updateMany({ where: { id: member.id, organizationId: tenant.organizationId, status: "INVITED" }, data: { status: "REMOVED" } });
        if (removed.count !== 1) throw new Error("INVITATION_NOT_PENDING");
      } else if (member?.status === "ACTIVE") {
        await tx.organizationMember.updateMany({ where: { id: member.id, organizationId: tenant.organizationId, status: "ACTIVE" }, data: { status: "SUSPENDED" } });
      }

      if (parsed.data.kind === "guardian") await tx.schoolGuardian.update({ where: { id: record.id }, data: { userId: null } });
      else await tx.schoolStudent.update({ where: { id: record.id }, data: { userId: null } });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") redirect(portalAccessRedirect(formData, "error", "not-found"));
    if (error instanceof Error && error.message === "INVITATION_NOT_PENDING") redirect(portalAccessRedirect(formData, "error", "revoke-unavailable"));
    throw error;
  }
  await logAuditEvent({ organizationId: tenant.organizationId, userId: tenant.userId, module: "school", action: "portal.access_revoked", entityName: parsed.data.kind === "guardian" ? "SchoolGuardian" : "SchoolStudent", entityId: parsed.data.recordId });
  revalidatePath(PATH);
  redirect(portalAccessRedirect(formData, "saved", "1"));
}
