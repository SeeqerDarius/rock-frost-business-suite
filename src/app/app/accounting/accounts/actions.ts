"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { createAccount, updateAccount, loadGhanaSmeChartOfAccounts, AccountCodeTakenError } from "@/modules/accounting/service";
import { shortText, cuid, parseWithSchema } from "@/lib/validation";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

const ACCOUNT_TYPES = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"] as const;
const LIQUIDITY_TYPES = ["NONE", "CASH", "BANK", "MOBILE_MONEY"] as const;

const accountSchema = z.object({
  id: cuid.nullable().optional(),
  code: shortText,
  name: shortText,
  type: z.enum(ACCOUNT_TYPES),
  liquidityType: z.enum(LIQUIDITY_TYPES),
});

export async function upsertAccount(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("accounting");
  if (!hasPermission(tenant, PERMISSIONS.ACCOUNTING_ACCOUNTS_MANAGE)) {
    redirect("/app/accounting/accounts?error=forbidden");
  }

  const parsed = parseWithSchema(accountSchema, {
    id: clean(formData.get("id")),
    code: clean(formData.get("code")),
    name: clean(formData.get("name")),
    type: clean(formData.get("type")),
    liquidityType: clean(formData.get("liquidityType")) ?? "NONE",
  });
  if (!parsed.success) {
    redirect("/app/accounting/accounts?error=missing-fields");
  }
  const { id, code, name, type, liquidityType } = parsed.data;

  const data = { code, name, type, liquidityType, bankName: clean(formData.get("bankName")), accountNumberLast4: clean(formData.get("accountNumberLast4")), active: formData.get("active") === "on" };

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
  revalidatePath("/app/accounting/cashbook");
  redirect("/app/accounting/accounts?saved=1");
}

export async function loadGhanaSmeChart(): Promise<void> {
  const tenant = await requireModuleAccess("accounting");
  if (!hasPermission(tenant, PERMISSIONS.ACCOUNTING_ACCOUNTS_MANAGE)) {
    redirect("/app/accounting/accounts?error=forbidden");
  }

  const { addedCount } = await loadGhanaSmeChartOfAccounts(tenant.organizationId);

  revalidatePath("/app/accounting/accounts");
  revalidatePath("/app/accounting/general-ledger");
  redirect(`/app/accounting/accounts?saved=1&added=${addedCount}`);
}
