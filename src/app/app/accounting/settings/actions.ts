"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { createExpenseCategory } from "@/modules/accounting/service";
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
  const tenant = await requireCurrentTenant();
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
