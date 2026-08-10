"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { createLeaveType, updateHrSettings } from "@/modules/hr/service";
import { shortText, parseWithSchema } from "@/lib/validation";

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

  await updateHrSettings(tenant.organizationId, parsed.data, tenant.userId);
  revalidatePath("/app/hr/settings");
  revalidatePath("/app/hr/employees");
  redirect("/app/hr/settings?saved=1");
}
