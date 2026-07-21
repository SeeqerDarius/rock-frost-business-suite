"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { updateSettings, InvalidCompensationError } from "@/modules/payroll/service";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

export async function saveDefaultTaxRate(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.PAYROLL_SETTINGS_MANAGE)) {
    redirect("/app/payroll/settings?error=forbidden");
  }

  const percentRaw = clean(formData.get("defaultTaxRatePercent"));
  if (!percentRaw) {
    redirect("/app/payroll/settings?error=missing-fields");
  }

  const rate = (Number.parseFloat(percentRaw) / 100).toFixed(4);
  try {
    await updateSettings(tenant.organizationId, rate);
  } catch (error) {
    if (error instanceof InvalidCompensationError) redirect("/app/payroll/settings?error=invalid-rate");
    throw error;
  }
  revalidatePath("/app/payroll/settings");
  redirect("/app/payroll/settings?saved=1");
}
