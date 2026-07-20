"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { createLeaveType } from "@/modules/hr/service";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

export async function addLeaveType(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.HR_SETTINGS_MANAGE)) {
    redirect("/app/hr/settings?error=forbidden");
  }

  const name = clean(formData.get("name"));
  const defaultDaysPerYearRaw = clean(formData.get("defaultDaysPerYear"));
  if (!name) {
    redirect("/app/hr/settings?error=missing-fields");
  }

  await createLeaveType(tenant.organizationId, {
    name,
    defaultDaysPerYear: defaultDaysPerYearRaw ? Number.parseInt(defaultDaysPerYearRaw, 10) : 0,
  });
  revalidatePath("/app/hr/settings");
  revalidatePath("/app/hr/leave");
  redirect("/app/hr/settings?saved=1");
}
