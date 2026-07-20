"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { createAccount, updateAccount, AccountCodeTakenError } from "@/modules/accounting/service";
import type { AccountingAccountType } from "@prisma/client";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

export async function upsertAccount(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.ACCOUNTING_ACCOUNTS_MANAGE)) {
    redirect("/app/accounting/accounts?error=forbidden");
  }

  const id = clean(formData.get("id"));
  const code = clean(formData.get("code"));
  const name = clean(formData.get("name"));
  const type = clean(formData.get("type")) as AccountingAccountType | null;

  if (!code || !name || !type) {
    redirect("/app/accounting/accounts?error=missing-fields");
  }

  const data = { code, name, type, active: formData.get("active") === "on" };

  try {
    if (id) {
      await updateAccount(tenant.organizationId, id, data);
    } else {
      await createAccount(tenant.organizationId, data);
    }
  } catch (error) {
    if (error instanceof AccountCodeTakenError) {
      redirect("/app/accounting/accounts?error=code-taken");
    }
    throw error;
  }

  revalidatePath("/app/accounting/accounts");
  redirect("/app/accounting/accounts?saved=1");
}
