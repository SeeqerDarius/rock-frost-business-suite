"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission, PERMISSIONS } from "@/lib/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import { logAuditEvent } from "@/lib/audit";
import { getHirePurchaseSettings } from "../settings";

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function num(value: FormDataEntryValue | null) {
  return Number(clean(value));
}

export async function updateHirePurchaseSettings(formData: FormData): Promise<void> {
  const tenant = await requirePermission(PERMISSIONS.HIREPURCHASE_SETTINGS_MANAGE);
  const session = await getServerAuthSession();
  const userId = session?.user?.id;

  const installmentDurationDays = Math.trunc(num(formData.get("installmentDurationDays")));
  const administrationFeePercent = num(formData.get("administrationFeePercent"));
  const refundDeductionPercent = num(formData.get("refundDeductionPercent"));
  const deliveryTimeAfterCompletionDays = Math.max(Math.trunc(num(formData.get("deliveryTimeAfterCompletionDays"))) || 0, 0);
  const procurementThresholdPercent = num(formData.get("procurementThresholdPercent"));
  const paymentEditWindowHours = Math.trunc(num(formData.get("paymentEditWindowHours")));
  const minimumDeposit = num(formData.get("minimumDeposit"));
  const defaultMonthlySalary = num(formData.get("defaultMonthlySalary"));
  const defaultStaffInventoryQuantity = Math.trunc(num(formData.get("defaultStaffInventoryQuantity")));
  const commissionEnabled = formData.get("commissionEnabled") === "on";
  const commissionPercentage = num(formData.get("commissionPercentage"));
  const payrollDay = Math.trunc(num(formData.get("payrollDay")));
  const receiptPrefix = clean(formData.get("receiptPrefix"));
  const customerIdPrefix = clean(formData.get("customerIdPrefix"));
  const staffCodeLength = Math.trunc(num(formData.get("staffCodeLength")));

  const errors: string[] = [];
  if (!(installmentDurationDays > 0)) errors.push("installment-duration");
  for (const [name, value] of [
    ["daily-collection", num(formData.get("defaultDailyCollection"))],
    ["admin-fee", administrationFeePercent],
    ["refund-deduction", refundDeductionPercent],
    ["procurement-threshold", procurementThresholdPercent],
    ["minimum-deposit", minimumDeposit],
    ["default-salary", defaultMonthlySalary],
    ["commission-percentage", commissionPercentage],
  ] as const) {
    if (!Number.isFinite(value) || value < 0) errors.push(name);
  }
  for (const [name, value] of [
    ["admin-fee", administrationFeePercent],
    ["refund-deduction", refundDeductionPercent],
    ["procurement-threshold", procurementThresholdPercent],
    ["commission-percentage", commissionPercentage],
  ] as const) {
    if (value > 100) errors.push(name);
  }
  if (paymentEditWindowHours < 3 || paymentEditWindowHours > 16) errors.push("edit-window");
  if (payrollDay < 1 || payrollDay > 31) errors.push("payroll-day");
  if (!(defaultStaffInventoryQuantity >= 0)) errors.push("inventory-quantity");
  if (staffCodeLength < 2 || staffCodeLength > 8) errors.push("staff-code-length");
  if (!receiptPrefix) errors.push("receipt-prefix");
  if (!customerIdPrefix) errors.push("customer-id-prefix");

  if (errors.length > 0) {
    redirect(`/hire-purchase/settings?error=${encodeURIComponent(errors.join(","))}`);
  }

  const existing = await getHirePurchaseSettings(tenant.organizationId);

  await db.hirePurchaseSettings.update({
    where: { organizationId: tenant.organizationId },
    data: {
      installmentDurationDays,
      defaultDailyCollection: num(formData.get("defaultDailyCollection")),
      administrationFeePercent,
      refundDeductionPercent,
      deliveryTimeAfterCompletionDays,
      procurementThresholdPercent,
      paymentEditWindowHours,
      minimumDeposit,
      defaultMonthlySalary,
      defaultStaffInventoryQuantity,
      commissionEnabled,
      commissionPercentage,
      payrollDay,
      receiptPrefix,
      customerIdPrefix,
      staffCodeLength,
    },
  });

  await logAuditEvent({
    organizationId: tenant.organizationId,
    userId,
    action: "UPDATE_HIRE_PURCHASE_SETTINGS",
    entityName: "HirePurchaseSettings",
    entityId: tenant.organizationId,
    changes: { before: existing },
  });

  revalidatePath("/hire-purchase/settings");
  redirect("/hire-purchase/settings?updated=settings");
}
