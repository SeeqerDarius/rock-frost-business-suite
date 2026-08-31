"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import {
  importBankStatementLines,
  confirmReconciliationMatch,
  ignoreReconciliationLine,
  completeDraftReconciliation,
  NotFoundError,
  ReconciliationStateError,
} from "@/modules/accounting/service";
import { parseCsv, findColumn, mapCsvRows, CsvParseError } from "@/lib/csv-import";
import { logAuditEvent } from "@/lib/audit";

const MAX_STATEMENT_CSV_BYTES = 2 * 1024 * 1024;

const clean = (value: FormDataEntryValue | null) => String(value ?? "").trim() || null;

async function context(reconciliationId: string) {
  const tenant = await requireModuleAccess("accounting");
  if (!hasPermission(tenant, PERMISSIONS.ACCOUNTING_RECONCILIATIONS_MANAGE)) {
    redirect(`/app/accounting/reconciliations/${reconciliationId}?error=forbidden`);
  }
  const session = await getServerAuthSession();
  if (!session?.user?.id) redirect("/login");
  return { tenant, userId: session.user.id };
}

const DATE_ALIASES = ["date", "transaction date", "posting date", "value date", "trans date"];
const DESCRIPTION_ALIASES = ["description", "narration", "details", "particulars", "transaction details", "remarks"];
const AMOUNT_ALIASES = ["amount", "transaction amount", "value"];
const DEBIT_ALIASES = ["debit", "withdrawal", "money out", "debit amount"];
const CREDIT_ALIASES = ["credit", "deposit", "money in", "credit amount"];

function parseStatementAmount(row: Record<string, string>, amountCol: string | null, debitCol: string | null, creditCol: string | null): string {
  if (amountCol) {
    const raw = row[amountCol]?.replace(/,/g, "").trim();
    const value = Number(raw);
    if (!raw || !Number.isFinite(value)) throw new Error(`Amount "${row[amountCol]}" is not a number.`);
    return value.toFixed(2);
  }
  const debit = Number((row[debitCol ?? ""] ?? "0").replace(/,/g, "").trim() || "0");
  const credit = Number((row[creditCol ?? ""] ?? "0").replace(/,/g, "").trim() || "0");
  if (!Number.isFinite(debit) || !Number.isFinite(credit)) throw new Error("Debit/credit column is not a number.");
  if (debit === 0 && credit === 0) throw new Error("Row has no debit or credit amount.");
  return (credit - debit).toFixed(2);
}

export async function importBankStatementLinesAction(formData: FormData): Promise<void> {
  const reconciliationId = String(formData.get("reconciliationId") ?? "");
  const { tenant, userId } = await context(reconciliationId);

  const file = formData.get("file");
  if (!(file instanceof File) || !file.size) redirect(`/app/accounting/reconciliations/${reconciliationId}?error=missing-file`);
  if (file.size > MAX_STATEMENT_CSV_BYTES) redirect(`/app/accounting/reconciliations/${reconciliationId}?error=file-too-large`);

  try {
    const content = await file.text();
    const { headers, rows } = parseCsv(content);
    const dateCol = findColumn(headers, DATE_ALIASES);
    const descCol = findColumn(headers, DESCRIPTION_ALIASES);
    const amountCol = findColumn(headers, AMOUNT_ALIASES);
    const debitCol = findColumn(headers, DEBIT_ALIASES);
    const creditCol = findColumn(headers, CREDIT_ALIASES);
    if (!dateCol || !descCol || (!amountCol && !debitCol && !creditCol)) {
      redirect(`/app/accounting/reconciliations/${reconciliationId}?error=unrecognized-columns`);
    }

    const { imported, errors } = mapCsvRows(rows, (row) => {
      const dateValue = new Date(row[dateCol!]);
      if (Number.isNaN(dateValue.getTime())) throw new Error(`Date "${row[dateCol!]}" is not a recognizable date.`);
      const description = row[descCol!]?.trim();
      if (!description) throw new Error("Description is required.");
      const amount = parseStatementAmount(row, amountCol, debitCol, creditCol);
      return { date: dateValue, description, amount };
    });

    if (imported.length === 0) redirect(`/app/accounting/reconciliations/${reconciliationId}?error=no-valid-rows`);

    const result = await importBankStatementLines(tenant.organizationId, reconciliationId, imported);
    await logAuditEvent({
      organizationId: tenant.organizationId,
      userId,
      module: "accounting",
      action: "reconciliation.statement_imported",
      entityName: "AccountingReconciliation",
      entityId: reconciliationId,
      metadata: { importedCount: result.importedCount, skippedDuplicates: result.skippedCount, rowErrors: errors.length },
    });
  } catch (error) {
    if (error instanceof CsvParseError) redirect(`/app/accounting/reconciliations/${reconciliationId}?error=invalid-csv`);
    if (error instanceof NotFoundError) redirect(`/app/accounting/reconciliations/${reconciliationId}?error=not-found`);
    if (error instanceof ReconciliationStateError) redirect(`/app/accounting/reconciliations/${reconciliationId}?error=not-draft`);
    throw error;
  }
  revalidatePath(`/app/accounting/reconciliations/${reconciliationId}`);
  redirect(`/app/accounting/reconciliations/${reconciliationId}?imported=1`);
}

export async function confirmMatchAction(formData: FormData): Promise<void> {
  const reconciliationId = String(formData.get("reconciliationId") ?? "");
  const { tenant } = await context(reconciliationId);
  const statementLineId = clean(formData.get("statementLineId"));
  const journalLineId = clean(formData.get("journalLineId"));
  if (!statementLineId || !journalLineId) redirect(`/app/accounting/reconciliations/${reconciliationId}?error=missing-fields`);
  try {
    await confirmReconciliationMatch(tenant.organizationId, reconciliationId, statementLineId, journalLineId);
  } catch (error) {
    if (error instanceof NotFoundError) redirect(`/app/accounting/reconciliations/${reconciliationId}?error=not-found`);
    if (error instanceof ReconciliationStateError) redirect(`/app/accounting/reconciliations/${reconciliationId}?error=already-decided`);
    throw error;
  }
  revalidatePath(`/app/accounting/reconciliations/${reconciliationId}`);
  redirect(`/app/accounting/reconciliations/${reconciliationId}?saved=1`);
}

export async function ignoreLineAction(formData: FormData): Promise<void> {
  const reconciliationId = String(formData.get("reconciliationId") ?? "");
  const { tenant } = await context(reconciliationId);
  const statementLineId = clean(formData.get("statementLineId"));
  if (!statementLineId) redirect(`/app/accounting/reconciliations/${reconciliationId}?error=missing-fields`);
  try {
    await ignoreReconciliationLine(tenant.organizationId, reconciliationId, statementLineId);
  } catch (error) {
    if (error instanceof NotFoundError) redirect(`/app/accounting/reconciliations/${reconciliationId}?error=not-found`);
    if (error instanceof ReconciliationStateError) redirect(`/app/accounting/reconciliations/${reconciliationId}?error=already-decided`);
    throw error;
  }
  revalidatePath(`/app/accounting/reconciliations/${reconciliationId}`);
  redirect(`/app/accounting/reconciliations/${reconciliationId}?saved=1`);
}

export async function completeDraftReconciliationAction(formData: FormData): Promise<void> {
  const reconciliationId = String(formData.get("reconciliationId") ?? "");
  const { tenant, userId } = await context(reconciliationId);
  const statementBalance = clean(formData.get("statementBalance"));
  if (!statementBalance) redirect(`/app/accounting/reconciliations/${reconciliationId}?error=missing-fields`);
  try {
    const record = await completeDraftReconciliation(tenant.organizationId, reconciliationId, { statementBalance, notes: clean(formData.get("notes")) }, userId);
    await logAuditEvent({ organizationId: tenant.organizationId, userId, module: "accounting", action: "reconciliation.completed", entityName: "AccountingReconciliation", entityId: record.id, metadata: { difference: record.difference.toString() } });
  } catch (error) {
    if (error instanceof NotFoundError) redirect(`/app/accounting/reconciliations/${reconciliationId}?error=not-found`);
    if (error instanceof ReconciliationStateError) redirect(`/app/accounting/reconciliations/${reconciliationId}?error=not-draft`);
    throw error;
  }
  revalidatePath("/app/accounting/cashbook");
  redirect("/app/accounting/cashbook?reconciled=1");
}
