"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { updateInstallmentSettings, InvalidSettingsError } from "@/modules/installment/service";

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

export async function saveInstallmentSettings(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("installment");
  if (!hasPermission(tenant, PERMISSIONS.HIREPURCHASE_SETTINGS_MANAGE)) {
    redirect("/app/installment/settings?error=forbidden");
  }

  try {
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
      defaultDailyCollection: clean(formData.get("defaultDailyCollection")),
      minimumDeposit: clean(formData.get("minimumDeposit")),
      administrationFeePercent: clean(formData.get("administrationFeePercent")),
      commissionEnabled: formData.get("commissionEnabled") === "on",
      commissionPercentage: clean(formData.get("commissionPercentage")),
      payrollDay: Number.parseInt(clean(formData.get("payrollDay")), 10),
    });
  } catch (error) {
    if (error instanceof InvalidSettingsError) redirect("/app/installment/settings?error=invalid-settings");
    throw error;
  }

  revalidatePath("/app/installment/settings");
  redirect("/app/installment/settings?saved=1");
}
