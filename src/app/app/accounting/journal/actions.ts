"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import { AccountingPeriodLockedError, approveJournalEntry, createManualJournalEntry, JournalApprovalError, JournalNotBalancedError, JournalReversalError, NotFoundError, rejectJournalEntry, reverseJournalEntry } from "@/modules/accounting/service";
import { moneyAmount, shortText, longText, cuid, dateInput, parseWithSchema } from "@/lib/validation";
import { logAuditEvent } from "@/lib/audit";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

const reverseJournalSchema = z.object({ id: cuid, entryDate: dateInput, reason: longText });

export async function reverseJournalEntryAction(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("accounting");
  if (!hasPermission(tenant, PERMISSIONS.ACCOUNTING_JOURNALS_REVERSE)) {
    redirect("/app/accounting/journal?error=forbidden-reversal");
  }
  const parsed = parseWithSchema(reverseJournalSchema, {
    id: clean(formData.get("id")),
    entryDate: clean(formData.get("entryDate")),
    reason: clean(formData.get("reason")),
  });
  if (!parsed.success) redirect("/app/accounting/journal?error=invalid-reversal");
  const session = await getServerAuthSession();
  try {
    const reversal = await reverseJournalEntry(tenant.organizationId, parsed.data.id, {
      entryDate: parsed.data.entryDate,
      reason: parsed.data.reason,
      actorId: session?.user?.id ?? null,
    });
    await logAuditEvent({ organizationId: tenant.organizationId, userId: session?.user?.id ?? null, module: "accounting", action: "journal.reversed", entityName: "AccountingJournalEntry", entityId: parsed.data.id, metadata: { reversalId: reversal.id } });
  } catch (error) {
    if (error instanceof AccountingPeriodLockedError) redirect("/app/accounting/journal?error=period-closed");
    if (error instanceof JournalReversalError || error instanceof NotFoundError) redirect("/app/accounting/journal?error=invalid-reversal");
    throw error;
  }
  revalidatePath("/app/accounting/journal");
  revalidatePath("/app/accounting/accounts");
  redirect("/app/accounting/journal?saved=1");
}

const journalEntrySchema = z.object({
  entryDate: dateInput,
  description: shortText,
  debitAccountId: cuid,
  creditAccountId: cuid,
  amount: moneyAmount,
  reference: longText.nullable().optional(),
});

export async function createJournalEntry(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("accounting");
  if (!hasPermission(tenant, PERMISSIONS.ACCOUNTING_ACCOUNTS_MANAGE)) {
    redirect("/app/accounting/journal?error=forbidden");
  }

  const parsed = parseWithSchema(journalEntrySchema, {
    entryDate: clean(formData.get("entryDate")),
    description: clean(formData.get("description")),
    debitAccountId: clean(formData.get("debitAccountId")),
    creditAccountId: clean(formData.get("creditAccountId")),
    amount: clean(formData.get("amount")),
    reference: clean(formData.get("reference")),
  });
  if (!parsed.success) {
    redirect("/app/accounting/journal?error=missing-fields");
  }
  const { entryDate, description, debitAccountId, creditAccountId, amount, reference } = parsed.data;

  if (debitAccountId === creditAccountId) {
    redirect("/app/accounting/journal?error=same-account");
  }

  const session = await getServerAuthSession();
  const requiresApproval = !hasPermission(tenant, PERMISSIONS.ACCOUNTING_JOURNAL_APPROVE);

  let entry;
  try {
    entry = await createManualJournalEntry(tenant.organizationId, {
      entryDate,
      description,
      reference: reference ?? null,
      createdById: session?.user?.id ?? null,
      requiresApproval,
      lines: [
        { accountId: debitAccountId, debit: amount },
        { accountId: creditAccountId, credit: amount },
      ],
    });
  } catch (error) {
    if (error instanceof JournalNotBalancedError || error instanceof NotFoundError) {
      await logAuditEvent({
        organizationId: tenant.organizationId,
        userId: session?.user?.id ?? null,
        module: "accounting",
        action: "journal.posted",
        entityName: "AccountingJournalEntry",
        status: "FAILURE",
        metadata: { reason: error.constructor.name },
      });
    }
    if (error instanceof JournalNotBalancedError) {
      redirect("/app/accounting/journal?error=not-balanced");
    }
    if (error instanceof AccountingPeriodLockedError) redirect("/app/accounting/journal?error=period-closed");
    if (error instanceof NotFoundError) redirect("/app/accounting/journal?error=not-found");
    throw error;
  }

  await logAuditEvent({
    organizationId: tenant.organizationId,
    userId: session?.user?.id ?? null,
    module: "accounting",
    action: requiresApproval ? "journal.submitted" : "journal.posted",
    entityName: "AccountingJournalEntry",
    entityId: entry.id,
    metadata: { lineCount: 2, description },
  });

  revalidatePath("/app/accounting/journal");
  revalidatePath("/app/accounting/accounts");
  redirect(requiresApproval ? "/app/accounting/journal?submitted=1" : "/app/accounting/journal?saved=1");
}

const journalDecisionSchema = z.object({ id: cuid });
const journalRejectionSchema = z.object({ id: cuid, reason: longText });

export async function approveJournalEntryAction(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("accounting");
  if (!hasPermission(tenant, PERMISSIONS.ACCOUNTING_JOURNAL_APPROVE)) {
    redirect("/app/accounting/journal?error=forbidden-approval");
  }
  const parsed = parseWithSchema(journalDecisionSchema, { id: clean(formData.get("id")) });
  if (!parsed.success) redirect("/app/accounting/journal?error=invalid-approval");
  const session = await getServerAuthSession();
  if (!session?.user?.id) redirect("/login");
  try {
    const entry = await approveJournalEntry(tenant.organizationId, parsed.data.id, session.user.id);
    await logAuditEvent({ organizationId: tenant.organizationId, userId: session.user.id, module: "accounting", action: "journal.approved", entityName: "AccountingJournalEntry", entityId: entry.id });
  } catch (error) {
    if (error instanceof JournalApprovalError) redirect("/app/accounting/journal?error=invalid-approval");
    if (error instanceof NotFoundError) redirect("/app/accounting/journal?error=not-found");
    throw error;
  }
  revalidatePath("/app/accounting/journal");
  revalidatePath("/app/accounting/accounts");
  redirect("/app/accounting/journal?saved=1");
}

export async function rejectJournalEntryAction(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("accounting");
  if (!hasPermission(tenant, PERMISSIONS.ACCOUNTING_JOURNAL_APPROVE)) {
    redirect("/app/accounting/journal?error=forbidden-approval");
  }
  const parsed = parseWithSchema(journalRejectionSchema, { id: clean(formData.get("id")), reason: clean(formData.get("reason")) });
  if (!parsed.success) redirect("/app/accounting/journal?error=invalid-rejection");
  const session = await getServerAuthSession();
  if (!session?.user?.id) redirect("/login");
  try {
    const entry = await rejectJournalEntry(tenant.organizationId, parsed.data.id, session.user.id, parsed.data.reason);
    await logAuditEvent({ organizationId: tenant.organizationId, userId: session.user.id, module: "accounting", action: "journal.rejected", entityName: "AccountingJournalEntry", entityId: entry.id, metadata: { reason: parsed.data.reason } });
  } catch (error) {
    if (error instanceof JournalApprovalError) redirect("/app/accounting/journal?error=invalid-rejection");
    if (error instanceof NotFoundError) redirect("/app/accounting/journal?error=not-found");
    throw error;
  }
  revalidatePath("/app/accounting/journal");
  redirect("/app/accounting/journal?saved=1");
}
