"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { createLeaveType, updateHrSettings, createPlanTemplate, updatePlanTemplate, deletePlanTemplate, NotFoundError } from "@/modules/hr/service";
import { shortText, parseWithSchema } from "@/lib/validation";
import type { HrPlanActivityType, HrPlanKind, HrPlanOwnerRule } from "@prisma/client";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

/** Days-per-year is a small non-negative whole number — `positiveInt` doesn't fit since 0 (no default allotment) is valid. */
const nonNegativeInt = z.coerce.number().int().min(0);

export async function addLeaveType(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("hr");
  if (!hasPermission(tenant, PERMISSIONS.HR_SETTINGS_MANAGE)) {
    redirect("/app/hr/settings?error=forbidden");
  }

  const parsed = parseWithSchema(
    z.object({ name: shortText, defaultDaysPerYear: nonNegativeInt }),
    {
      name: clean(formData.get("name")) ?? "",
      defaultDaysPerYear: clean(formData.get("defaultDaysPerYear")) ?? "0",
    },
  );
  if (!parsed.success) {
    redirect("/app/hr/settings?error=missing-fields");
  }
  const { name, defaultDaysPerYear } = parsed.data;

  await createLeaveType(tenant.organizationId, { name, defaultDaysPerYear });
  revalidatePath("/app/hr/settings");
  revalidatePath("/app/hr/leave");
  redirect("/app/hr/settings?saved=1");
}

const employeeNumberSchema = z.object({
  employeeNumberPrefix: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,8}$/, "Use 2-8 uppercase letters or numbers."),
});

export async function saveHrSettings(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("hr");
  if (!hasPermission(tenant, PERMISSIONS.HR_SETTINGS_MANAGE)) {
    redirect("/app/hr/settings?error=forbidden");
  }

  const parsed = parseWithSchema(employeeNumberSchema, { employeeNumberPrefix: clean(formData.get("employeeNumberPrefix")) ?? "" });
  if (!parsed.success) redirect("/app/hr/settings?error=invalid-prefix");

  await updateHrSettings(tenant.organizationId, { ...parsed.data, terminationApprovalRequired: formData.get("terminationApprovalRequired") === "on" }, tenant.userId);
  revalidatePath("/app/hr/settings");
  revalidatePath("/app/hr/employees");
  redirect("/app/hr/settings?saved=1");
}

const planActivitySchema = z.object({
  title: shortText,
  activityType: z.enum(["TODO", "EMAIL", "CALL", "MEETING", "DOCUMENT"]),
  dueDateOffsetDays: z.coerce.number().int(),
  ownerRule: z.enum(["EMPLOYEE", "MANAGER", "HR_MANAGER", "UNASSIGNED"]),
});

function parsePlanActivities(raw: FormDataEntryValue | null): { title: string; activityType: HrPlanActivityType; dueDateOffsetDays: number; ownerRule: HrPlanOwnerRule }[] | null {
  try {
    const items = JSON.parse(String(raw ?? "[]"));
    if (!Array.isArray(items) || items.length === 0) return null;
    const parsed = items.map((item) => planActivitySchema.safeParse(item));
    if (parsed.some((result) => !result.success)) return null;
    return parsed.map((result) => (result as { success: true; data: z.infer<typeof planActivitySchema> }).data);
  } catch {
    return null;
  }
}

export async function savePlanTemplate(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("hr");
  if (!hasPermission(tenant, PERMISSIONS.HR_ONBOARDING_MANAGE)) {
    redirect("/app/hr/settings?error=forbidden");
  }

  const id = clean(formData.get("id"));
  const kind = clean(formData.get("kind")) as HrPlanKind | null;
  const name = clean(formData.get("name"));
  const activities = parsePlanActivities(formData.get("activitiesJson"));
  if (!name || !kind || !["ONBOARDING", "OFFBOARDING"].includes(kind) || !activities) {
    redirect("/app/hr/settings?error=missing-fields");
  }

  try {
    if (id) {
      await updatePlanTemplate(tenant.organizationId, id, { name, activities });
    } else {
      await createPlanTemplate(tenant.organizationId, { kind, name, activities });
    }
  } catch (error) {
    if (error instanceof NotFoundError) redirect("/app/hr/settings?error=not-found");
    throw error;
  }

  revalidatePath("/app/hr/settings");
  redirect("/app/hr/settings?saved=1");
}

export async function removePlanTemplate(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("hr");
  if (!hasPermission(tenant, PERMISSIONS.HR_ONBOARDING_MANAGE)) {
    redirect("/app/hr/settings?error=forbidden");
  }
  const id = clean(formData.get("id"));
  if (!id) return;

  try {
    await deletePlanTemplate(tenant.organizationId, id);
  } catch (error) {
    if (error instanceof NotFoundError) redirect("/app/hr/settings?error=not-found");
    throw error;
  }

  revalidatePath("/app/hr/settings");
  redirect("/app/hr/settings?saved=1");
}
