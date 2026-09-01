"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { createAccount, updateAccount, loadGhanaSmeChartOfAccounts, importAccountsFromCsv, AccountCodeTakenError } from "@/modules/accounting/service";
import { shortText, cuid, parseWithSchema } from "@/lib/validation";
import { parseCsv, findColumn, mapCsvRows, CsvParseError } from "@/lib/csv-import";

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

const ACCOUNT_TYPE_SET = new Set(ACCOUNT_TYPES);
const LIQUIDITY_TYPE_SET = new Set(LIQUIDITY_TYPES);
const MAX_ACCOUNTS_CSV_BYTES = 1 * 1024 * 1024;

export async function importAccountsCsvAction(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("accounting");
  if (!hasPermission(tenant, PERMISSIONS.ACCOUNTING_ACCOUNTS_MANAGE)) {
    redirect("/app/accounting/accounts?error=forbidden");
  }

  const file = formData.get("file");
  if (!(file instanceof File) || !file.size) redirect("/app/accounting/accounts?error=missing-file");
  if (file.size > MAX_ACCOUNTS_CSV_BYTES) redirect("/app/accounting/accounts?error=file-too-large");

  let importedCount = 0;
  let skippedCount = 0;
  let rowErrorCount = 0;
  try {
    const content = await file.text();
    const { headers, rows } = parseCsv(content);
    const codeCol = findColumn(headers, ["code", "account code"]);
    const nameCol = findColumn(headers, ["name", "account name"]);
    const typeCol = findColumn(headers, ["type", "account type"]);
    const liquidityCol = findColumn(headers, ["liquidity", "liquidity type", "cash type"]);
    if (!codeCol || !nameCol || !typeCol) redirect("/app/accounting/accounts?error=unrecognized-columns");

    const { imported, errors } = mapCsvRows(rows, (row) => {
      const code = row[codeCol!]?.trim();
      const name = row[nameCol!]?.trim();
      const type = row[typeCol!]?.trim().toUpperCase();
      if (!code) throw new Error("Code is required.");
      if (!name) throw new Error("Name is required.");
      if (!ACCOUNT_TYPE_SET.has(type as (typeof ACCOUNT_TYPES)[number])) throw new Error(`Type "${row[typeCol!]}" is not one of ${ACCOUNT_TYPES.join(", ")}.`);
      const liquidityRaw = liquidityCol ? row[liquidityCol]?.trim().toUpperCase().replace(/\s+/g, "_") : undefined;
      const liquidityType = liquidityRaw && LIQUIDITY_TYPE_SET.has(liquidityRaw as (typeof LIQUIDITY_TYPES)[number]) ? (liquidityRaw as (typeof LIQUIDITY_TYPES)[number]) : undefined;
      return { code, name, type: type as (typeof ACCOUNT_TYPES)[number], liquidityType };
    });
    rowErrorCount = errors.length;
    if (imported.length === 0) redirect("/app/accounting/accounts?error=no-valid-rows");

    const result = await importAccountsFromCsv(tenant.organizationId, imported);
    importedCount = result.importedCount;
    skippedCount = result.skippedCount + rowErrorCount;
  } catch (error) {
    if (error instanceof CsvParseError) redirect("/app/accounting/accounts?error=invalid-csv");
    throw error;
  }

  revalidatePath("/app/accounting/accounts");
  redirect(`/app/accounting/accounts?saved=1&imported=${importedCount}&skipped=${skippedCount}`);
}
