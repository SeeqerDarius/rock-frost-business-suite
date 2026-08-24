"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { previewPlanLaunch, launchPlan, completePlanActivity, NotFoundError } from "@/modules/hr/service";
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
