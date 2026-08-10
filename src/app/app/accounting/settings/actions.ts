"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { createExpenseCategory, updateAccountingSettings } from "@/modules/accounting/service";
import { shortText, cuid, parseWithSchema } from "@/lib/validation";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

const expenseCategorySchema = z.object({
  name: shortText,
  expenseAccountId: cuid.nullable().optional(),
});

export async function addExpenseCategory(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("accounting");
  if (!hasPermission(tenant, PERMISSIONS.ACCOUNTING_SETTINGS_MANAGE)) {
    redirect("/app/accounting/settings?error=forbidden");
  }

  const parsed = parseWithSchema(expenseCategorySchema, {
    name: clean(formData.get("name")),
    expenseAccountId: clean(formData.get("expenseAccountId")),
  });
  if (!parsed.success) {
    redirect("/app/accounting/settings?error=missing-fields");
  }
  const { name, expenseAccountId } = parsed.data;

  await createExpenseCategory(tenant.organizationId, { name, expenseAccountId: expenseAccountId ?? null });
  revalidatePath("/app/accounting/settings");
  revalidatePath("/app/accounting/expenses");
  redirect("/app/accounting/settings?saved=1");
}

const invoiceSettingsSchema = z.object({
  invoiceNumberPrefix: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2,8}$/, "Use 2-8 uppercase letters or numbers."),
});

export async function saveAccountingSettings(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("accounting");
  if (!hasPermission(tenant, PERMISSIONS.ACCOUNTING_SETTINGS_MANAGE)) {
    redirect("/app/accounting/settings?error=forbidden");
  }

  const parsed = parseWithSchema(invoiceSettingsSchema, {
    invoiceNumberPrefix: String(formData.get("invoiceNumberPrefix") ?? "").trim(),
  });
  if (!parsed.success) redirect("/app/accounting/settings?error=invalid-prefix");

  await updateAccountingSettings(tenant.organizationId, parsed.data, tenant.userId);
  revalidatePath("/app/accounting/settings");
  revalidatePath("/app/accounting/invoices");
  redirect("/app/accounting/settings?saved=1");
}
