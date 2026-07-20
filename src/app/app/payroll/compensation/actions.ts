"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { setCompensation } from "@/modules/payroll/service";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

export async function saveCompensation(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.PAYROLL_COMPENSATION_MANAGE)) {
    redirect("/app/payroll/compensation?error=forbidden");
  }

  const employeeId = clean(formData.get("employeeId"));
  const baseSalary = clean(formData.get("baseSalary"));
  const effectiveDateRaw = clean(formData.get("effectiveDate"));
  if (!employeeId || !baseSalary || !effectiveDateRaw) {
    redirect("/app/payroll/compensation?error=missing-fields");
  }

  await setCompensation(tenant.organizationId, {
    employeeId,
    baseSalary,
    payFrequency: clean(formData.get("payFrequency")) ?? "MONTHLY",
    effectiveDate: new Date(`${effectiveDateRaw}T00:00:00`),
  });

  revalidatePath("/app/payroll/compensation");
  redirect("/app/payroll/compensation?saved=1");
}
