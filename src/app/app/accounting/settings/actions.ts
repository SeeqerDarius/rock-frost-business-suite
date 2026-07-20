"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { createExpenseCategory } from "@/modules/accounting/service";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

export async function addExpenseCategory(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.ACCOUNTING_SETTINGS_MANAGE)) {
    redirect("/app/accounting/settings?error=forbidden");
  }

  const name = clean(formData.get("name"));
  if (!name) {
    redirect("/app/accounting/settings?error=missing-fields");
  }

  await createExpenseCategory(tenant.organizationId, { name, expenseAccountId: clean(formData.get("expenseAccountId")) });
  revalidatePath("/app/accounting/settings");
  revalidatePath("/app/accounting/expenses");
  redirect("/app/accounting/settings?saved=1");
}
