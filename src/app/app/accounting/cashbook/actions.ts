"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import { postOpeningBalance, completeReconciliation, NotFoundError, InvalidPaymentError, InvoiceStateError } from "@/modules/accounting/service";
import { logAuditEvent } from "@/lib/audit";

const clean = (value: FormDataEntryValue | null) => String(value ?? "").trim() || null;
async function context(permission: string) {
  const tenant = await requireModuleAccess("accounting");
  if (!hasPermission(tenant, permission)) redirect("/app/accounting/cashbook?error=forbidden");
  const session = await getServerAuthSession();
  if (!session?.user?.id) redirect("/login");
  return { tenant, userId: session.user.id };
}

export async function createOpeningBalance(formData: FormData): Promise<void> {
  const { tenant, userId } = await context(PERMISSIONS.ACCOUNTING_CASHBOOK_MANAGE);
  const accountId = clean(formData.get("accountId")); const amount = clean(formData.get("amount")); const asOfDate = clean(formData.get("asOfDate"));
  if (!accountId || !amount || !asOfDate) redirect("/app/accounting/cashbook?error=missing-fields");
  try {
    const entry = await postOpeningBalance(tenant.organizationId, accountId, amount, new Date(`${asOfDate}T00:00:00.000Z`), userId);
    await logAuditEvent({ organizationId: tenant.organizationId, userId, module: "accounting", action: "opening_balance.posted", entityName: "AccountingJournalEntry", entityId: entry.id, metadata: { accountId, amount } });
  } catch (error) {
    if (error instanceof NotFoundError) redirect("/app/accounting/cashbook?error=not-found");
    if (error instanceof InvalidPaymentError || error instanceof InvoiceStateError) redirect("/app/accounting/cashbook?error=invalid-opening-balance");
    throw error;
  }
  revalidatePath("/app/accounting/cashbook"); revalidatePath("/app/accounting/accounts");
  redirect("/app/accounting/cashbook?saved=1");
}

export async function reconcileAccount(formData: FormData): Promise<void> {
  const { tenant, userId } = await context(PERMISSIONS.ACCOUNTING_RECONCILIATIONS_MANAGE);
  const accountId = clean(formData.get("accountId")); const periodStart = clean(formData.get("periodStart")); const periodEnd = clean(formData.get("periodEnd")); const statementBalance = clean(formData.get("statementBalance"));
  if (!accountId || !periodStart || !periodEnd || !statementBalance) redirect("/app/accounting/cashbook?error=missing-fields");
  try {
    const record = await completeReconciliation(tenant.organizationId, { accountId, periodStart: new Date(`${periodStart}T00:00:00.000Z`), periodEnd: new Date(`${periodEnd}T23:59:59.999Z`), statementBalance, notes: clean(formData.get("notes")), completedById: userId });
    await logAuditEvent({ organizationId: tenant.organizationId, userId, module: "accounting", action: "reconciliation.completed", entityName: "AccountingReconciliation", entityId: record.id, metadata: { accountId, difference: record.difference.toString() } });
  } catch (error) { if (error instanceof NotFoundError) redirect("/app/accounting/cashbook?error=not-found"); throw error; }
  revalidatePath("/app/accounting/cashbook"); redirect("/app/accounting/cashbook?reconciled=1");
}
