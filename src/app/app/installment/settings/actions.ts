"use server";

import { redirect } from "next/navigation";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { updateInstallmentSettings } from "@/modules/installment/service";

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

export async function saveInstallmentSettings(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.HIREPURCHASE_SETTINGS_MANAGE)) {
    redirect("/app/installment/settings?error=forbidden");
  }

  await updateInstallmentSettings(tenant.organizationId, {
    installmentDurationDays: Number.parseInt(clean(formData.get("installmentDurationDays")), 10),
    refundDeductionPercent: clean(formData.get("refundDeductionPercent")),
    paymentEditWindowHours: Number.parseInt(clean(formData.get("paymentEditWindowHours")), 10),
    procurementThresholdPercent: clean(formData.get("procurementThresholdPercent")),
    deliveryTimeAfterCompletionDays: Number.parseInt(clean(formData.get("deliveryTimeAfterCompletionDays")), 10),
    receiptPrefix: clean(formData.get("receiptPrefix")),
    customerIdPrefix: clean(formData.get("customerIdPrefix")),
    staffCodeLength: Number.parseInt(clean(formData.get("staffCodeLength")), 10),
    defaultStaffInventoryQuantity: Number.parseInt(clean(formData.get("defaultStaffInventoryQuantity")), 10),
    defaultMonthlySalary: clean(formData.get("defaultMonthlySalary")),
    minimumDeposit: clean(formData.get("minimumDeposit")),
    administrationFeePercent: clean(formData.get("administrationFeePercent")),
    commissionEnabled: formData.get("commissionEnabled") === "on",
    commissionPercentage: clean(formData.get("commissionPercentage")),
    payrollDay: Number.parseInt(clean(formData.get("payrollDay")), 10),
  });

  redirect("/app/installment/settings?saved=1");
}
