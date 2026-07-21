"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { updateSettings, InvalidCompensationError } from "@/modules/payroll/service";
import { percent0to100, parseWithSchema } from "@/lib/validation";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

const taxRateSchema = z.object({ defaultTaxRatePercent: percent0to100 });

export async function saveDefaultTaxRate(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.PAYROLL_SETTINGS_MANAGE)) {
    redirect("/app/payroll/settings?error=forbidden");
  }

  const parsed = parseWithSchema(taxRateSchema, {
    defaultTaxRatePercent: clean(formData.get("defaultTaxRatePercent")),
  });
  if (!parsed.success) {
    redirect("/app/payroll/settings?error=invalid-rate");
  }

  const rate = (parsed.data.defaultTaxRatePercent / 100).toFixed(4);
  try {
    await updateSettings(tenant.organizationId, rate);
  } catch (error) {
    if (error instanceof InvalidCompensationError) redirect("/app/payroll/settings?error=invalid-rate");
    throw error;
  }
  revalidatePath("/app/payroll/settings");
  redirect("/app/payroll/settings?saved=1");
}
