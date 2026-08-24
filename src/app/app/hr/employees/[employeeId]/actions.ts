"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import { previewPlanLaunch, launchPlan, completePlanActivity, createResumeEntry, updateResumeEntry, deleteResumeEntry, setEmployeeSkill, removeEmployeeSkill, NotFoundError } from "@/modules/hr/service";
import { createInvitation, markInvitationDeliveryFailed } from "@/lib/auth/invitations";
import { sendEmail } from "@/lib/email";
import { invitationEmail } from "@/lib/email-templates";
import { buildTenantAppUrl } from "@/lib/app-url";
import { isPlatformUser } from "@/lib/auth/platform-identity";
import { isRoleAssignableToOrganization, resolveAssignableModuleKeys, roleDisplayName } from "@/lib/administration-roles";
import { assertRoleHasAvailableSeats, SeatLimitExceededError } from "@/platform/subscriptions/seats";
import { logAuditEvent } from "@/lib/audit";
import type { HrPlanKind } from "@prisma/client";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

export type PlanPreviewResult =
  | { ok: true; activities: { title: string; activityType: string; dueDate: string; ownerId: string | null }[] }
  | { ok: false; error: string };

export async function previewLaunchPlan(formData: FormData): Promise<PlanPreviewResult> {
  const tenant = await requireModuleAccess("hr");
  if (!hasPermission(tenant, PERMISSIONS.HR_ONBOARDING_MANAGE)) return { ok: false, error: "You don't have permission to launch plans." };

  const employeeId = clean(formData.get("employeeId"));
  const templateId = clean(formData.get("templateId"));
  const targetDateRaw = clean(formData.get("targetDate"));
  if (!employeeId || !templateId || !targetDateRaw) return { ok: false, error: "Choose a template and a target date." };

  try {
    const activities = await previewPlanLaunch(tenant.organizationId, { employeeId, templateId, targetDate: new Date(`${targetDateRaw}T00:00:00`) });
    return { ok: true, activities: activities.map((activity) => ({ ...activity, dueDate: activity.dueDate.toISOString() })) };
  } catch (error) {
    if (error instanceof NotFoundError) return { ok: false, error: error.message };
    throw error;
  }
}

export async function launchEmployeePlan(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("hr");
  if (!hasPermission(tenant, PERMISSIONS.HR_ONBOARDING_MANAGE)) {
    redirect("/app/hr/employees?error=forbidden");
  }

  const employeeId = clean(formData.get("employeeId"));
  const kind = clean(formData.get("kind")) as HrPlanKind | null;
  const templateId = clean(formData.get("templateId"));
  const targetDateRaw = clean(formData.get("targetDate"));
  if (!employeeId || !kind || !templateId || !targetDateRaw) {
    redirect(`/app/hr/employees/${employeeId}?error=missing-fields`);
  }

  try {
    await launchPlan(tenant.organizationId, { employeeId, kind, templateId, targetDate: new Date(`${targetDateRaw}T00:00:00`), launchedById: tenant.userId });
  } catch (error) {
    if (error instanceof NotFoundError) redirect(`/app/hr/employees/${employeeId}?error=not-found`);
    throw error;
  }

  revalidatePath(`/app/hr/employees/${employeeId}`);
  redirect(`/app/hr/employees/${employeeId}?saved=1`);
}

export async function markPlanActivityDone(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("hr");
  if (!hasPermission(tenant, PERMISSIONS.HR_ONBOARDING_MANAGE) && !hasPermission(tenant, PERMISSIONS.HR_EMPLOYEES_MANAGE)) {
    redirect("/app/hr/employees?error=forbidden");
  }
  const activityId = clean(formData.get("activityId"));
  const employeeId = clean(formData.get("employeeId"));
  if (!activityId || !employeeId) return;

  await completePlanActivity(tenant.organizationId, activityId, tenant.userId);
  revalidatePath(`/app/hr/employees/${employeeId}`);
  redirect(`/app/hr/employees/${employeeId}?saved=1`);
}

class PlatformOwnerTenantError extends Error {}

/** Thin employee-specific wrapper around the exact same membership-creation
 * transaction inviteMember() (src/app/app/(overview)/administration/actions.ts)
 * already establishes for the "invite a new org member" flow - not new
 * membership logic, just also linking the result back to HrEmployee.userId. */
export async function createUserForEmployee(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("hr");
  if (!hasPermission(tenant, PERMISSIONS.HR_EMPLOYEES_MANAGE)) {
    redirect("/app/hr/employees?error=forbidden");
  }

  const employeeId = clean(formData.get("employeeId"));
  const roleId = clean(formData.get("roleId"));
  if (!employeeId || !roleId) redirect(`/app/hr/employees/${employeeId}?error=missing-fields`);

  const employee = await db.hrEmployee.findFirst({ where: { id: employeeId, organizationId: tenant.organizationId } });
  if (!employee) redirect("/app/hr/employees?error=not-found");
  if (employee.userId) redirect(`/app/hr/employees/${employeeId}?error=already-linked`);
  if (!employee.email) redirect(`/app/hr/employees/${employeeId}?error=missing-fields`);
  const email = employee.email;

  const existingUser = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (existingUser && await isPlatformUser(existingUser.id)) redirect(`/app/hr/employees/${employeeId}?error=platform-owner`);

  const role = await db.role.findFirst({
    where: { id: roleId, OR: [{ organizationId: tenant.organizationId }, { isSystem: true }] },
    include: { rolePermissions: { include: { permission: true } } },
  });
  const assignableModuleKeys = await resolveAssignableModuleKeys(tenant.organizationId, tenant.enabledModuleKeys);
  if (!role || role.name === "Super Admin" || !isRoleAssignableToOrganization(role, tenant.organizationId, assignableModuleKeys)) {
    redirect(`/app/hr/employees/${employeeId}?error=invalid-role`);
  }

  const session = await getServerAuthSession();
  let membership;
  try {
    membership = await db.$transaction(async (tx) => {
      const user = await tx.user.upsert({ where: { email }, update: {}, create: { email, name: employee.fullName, phone: employee.phone, status: "INVITED" } });
      if (await isPlatformUser(user.id, tx)) throw new PlatformOwnerTenantError();

      const existingMembership = await tx.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId: tenant.organizationId, userId: user.id } },
        select: { id: true },
      });
      await assertRoleHasAvailableSeats(tx, tenant.organizationId, roleId, existingMembership?.id);

      const member = await tx.organizationMember.upsert({
        where: { organizationId_userId: { organizationId: tenant.organizationId, userId: user.id } },
        update: { roleId, status: "INVITED" },
        create: { organizationId: tenant.organizationId, userId: user.id, roleId, status: "INVITED" },
      });

      await tx.hrEmployee.update({ where: { id: employee.id }, data: { userId: user.id } });

      await logAuditEvent({
        organizationId: tenant.organizationId,
        userId: session?.user?.id,
        module: "hr",
        action: "employee.user_created",
        entityName: "HrEmployee",
        entityId: employee.id,
        metadata: { email, role: role!.name },
      }, tx);

      return member;
    });
  } catch (error) {
    if (error instanceof PlatformOwnerTenantError) redirect(`/app/hr/employees/${employeeId}?error=platform-owner`);
    if (error instanceof SeatLimitExceededError) redirect(`/app/hr/employees/${employeeId}?error=seat-limit`);
    throw error;
  }

  const token = await createInvitation({ organizationId: tenant.organizationId, membershipId: membership.id, email, createdById: session?.user?.id ?? null });
  const inviteUrl = buildTenantAppUrl("/invite", { token });
  const delivery = await sendEmail({ to: email, ...invitationEmail({ organizationName: tenant.organization.name, roleName: roleDisplayName(role!.name), inviteUrl }) });
  if (!delivery.ok) await markInvitationDeliveryFailed(membership.id);

  revalidatePath(`/app/hr/employees/${employeeId}`);
  redirect(`/app/hr/employees/${employeeId}?${delivery.ok ? "saved=1" : "error=delivery-failed"}`);
}

function parseResumeEntry(formData: FormData) {
  const title = clean(formData.get("title"));
  const type = clean(formData.get("type"));
  const dateStartRaw = clean(formData.get("dateStart"));
  const dateEndRaw = clean(formData.get("dateEnd"));
  if (!title || !type || !["EXPERIENCE", "EDUCATION", "INTERNAL"].includes(type) || !dateStartRaw) return null;
  return {
    title,
    type: type as "EXPERIENCE" | "EDUCATION" | "INTERNAL",
    dateStart: new Date(`${dateStartRaw}T00:00:00`),
    dateEnd: dateEndRaw ? new Date(`${dateEndRaw}T00:00:00`) : null,
    description: clean(formData.get("description")),
  };
}

export async function saveResumeEntry(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("hr");
  if (!hasPermission(tenant, PERMISSIONS.HR_EMPLOYEES_EDIT) && !hasPermission(tenant, PERMISSIONS.HR_EMPLOYEES_MANAGE)) {
    redirect("/app/hr/employees?error=forbidden");
  }
  const employeeId = clean(formData.get("employeeId"));
  const id = clean(formData.get("id"));
  const data = parseResumeEntry(formData);
  if (!employeeId || !data) redirect(`/app/hr/employees/${employeeId}?error=missing-fields`);

  try {
    if (id) {
      await updateResumeEntry(tenant.organizationId, id, data);
    } else {
      await createResumeEntry(tenant.organizationId, employeeId, data);
    }
  } catch (error) {
    if (error instanceof NotFoundError) redirect(`/app/hr/employees/${employeeId}?error=not-found`);
    throw error;
  }

  revalidatePath(`/app/hr/employees/${employeeId}`);
  redirect(`/app/hr/employees/${employeeId}?saved=1`);
}

export async function removeResumeEntry(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("hr");
  if (!hasPermission(tenant, PERMISSIONS.HR_EMPLOYEES_EDIT) && !hasPermission(tenant, PERMISSIONS.HR_EMPLOYEES_MANAGE)) {
    redirect("/app/hr/employees?error=forbidden");
  }
  const employeeId = clean(formData.get("employeeId"));
  const id = clean(formData.get("id"));
  if (!employeeId || !id) return;

  try {
    await deleteResumeEntry(tenant.organizationId, id);
  } catch (error) {
    if (error instanceof NotFoundError) redirect(`/app/hr/employees/${employeeId}?error=not-found`);
    throw error;
  }

  revalidatePath(`/app/hr/employees/${employeeId}`);
  redirect(`/app/hr/employees/${employeeId}?saved=1`);
}

export async function saveEmployeeSkill(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("hr");
  if (!hasPermission(tenant, PERMISSIONS.HR_EMPLOYEES_EDIT) && !hasPermission(tenant, PERMISSIONS.HR_EMPLOYEES_MANAGE)) {
    redirect("/app/hr/employees?error=forbidden");
  }
  const employeeId = clean(formData.get("employeeId"));
  const skillId = clean(formData.get("skillId"));
  const level = Number(clean(formData.get("level")) ?? "0");
  if (!employeeId || !skillId || !Number.isInteger(level) || level < 1 || level > 5) {
    redirect(`/app/hr/employees/${employeeId}?error=missing-fields`);
  }

  try {
    await setEmployeeSkill(tenant.organizationId, employeeId, skillId, level);
  } catch (error) {
    if (error instanceof NotFoundError) redirect(`/app/hr/employees/${employeeId}?error=not-found`);
    throw error;
  }

  revalidatePath(`/app/hr/employees/${employeeId}`);
  redirect(`/app/hr/employees/${employeeId}?saved=1`);
}

export async function removeEmployeeSkillAction(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("hr");
  if (!hasPermission(tenant, PERMISSIONS.HR_EMPLOYEES_EDIT) && !hasPermission(tenant, PERMISSIONS.HR_EMPLOYEES_MANAGE)) {
    redirect("/app/hr/employees?error=forbidden");
  }
  const employeeId = clean(formData.get("employeeId"));
  const id = clean(formData.get("id"));
  if (!employeeId || !id) return;

  try {
    await removeEmployeeSkill(tenant.organizationId, id);
  } catch (error) {
    if (error instanceof NotFoundError) redirect(`/app/hr/employees/${employeeId}?error=not-found`);
    throw error;
  }

  revalidatePath(`/app/hr/employees/${employeeId}`);
  redirect(`/app/hr/employees/${employeeId}?saved=1`);
}
