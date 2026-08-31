"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import {
  createCreditNote,
  applyCreditNoteToInvoice,
  refundCreditNote,
  voidCreditNote,
  CreditNoteStateError,
  InvalidPaymentError,
  InvalidLineItemsError,
  NotFoundError,
  AccountingPeriodLockedError,
  type LineItemInput,
} from "@/modules/accounting/service";
import { shortText, longText, email, cuid, dateInput, parseIndexedFormRows, parseWithSchema } from "@/lib/validation";
import { logAuditEvent } from "@/lib/audit";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

const createCreditNoteSchema = z.object({
  contactId: cuid.nullable().optional(),
  customerName: shortText,
  customerEmail: email.nullable().optional(),
  description: longText.nullable().optional(),
  issueDate: dateInput,
  taxCodeId: cuid.nullable().optional(),
});

export async function createNewCreditNote(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("accounting");
  if (!hasPermission(tenant, PERMISSIONS.ACCOUNTING_RECEIVABLES_MANAGE)) {
    redirect("/app/accounting/credit-notes?error=forbidden");
  }

  const parsed = parseWithSchema(createCreditNoteSchema, {
    contactId: clean(formData.get("contactId")),
    customerName: clean(formData.get("customerName")),
    customerEmail: clean(formData.get("customerEmail")),
    description: clean(formData.get("description")),
    issueDate: clean(formData.get("issueDate")),
    taxCodeId: clean(formData.get("taxCodeId")),
  });
  if (!parsed.success) {
    redirect("/app/accounting/credit-notes?error=missing-fields");
  }
  const { contactId, customerName, customerEmail, description, issueDate, taxCodeId } = parsed.data;
  const lines = parseIndexedFormRows(formData, "lines", ["description", "quantity", "unitPrice"]) as unknown as LineItemInput[];

  const session = await getServerAuthSession();
  try {
    await createCreditNote(
      tenant.organizationId,
      { contactId: contactId ?? null, customerName, customerEmail: customerEmail ?? null, description: description ?? null, lines, issueDate, taxCodeId: taxCodeId ?? null },
      session?.user?.id ?? null,
    );
  } catch (error) {
    if (error instanceof InvalidLineItemsError) redirect("/app/accounting/credit-notes?error=invalid-lines");
    throw error;
  }

  revalidatePath("/app/accounting/credit-notes");
  redirect("/app/accounting/credit-notes?saved=1");
}

const applySchema = z.object({ id: cuid, invoiceId: cuid });

export async function applyCreditNote(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("accounting");
  if (!hasPermission(tenant, PERMISSIONS.ACCOUNTING_RECEIVABLES_MANAGE)) {
    redirect("/app/accounting/credit-notes?error=forbidden");
  }

  const parsed = parseWithSchema(applySchema, { id: clean(formData.get("id")), invoiceId: clean(formData.get("invoiceId")) });
  if (!parsed.success) {
    redirect("/app/accounting/credit-notes?error=missing-fields");
  }
  const { id, invoiceId } = parsed.data;
  const session = await getServerAuthSession();

  let creditNote;
  try {
    creditNote = await applyCreditNoteToInvoice(tenant.organizationId, id, invoiceId, session?.user?.id ?? null);
  } catch (error) {
    if (error instanceof AccountingPeriodLockedError) redirect("/app/accounting/credit-notes?error=period-closed");
    if (error instanceof CreditNoteStateError) redirect("/app/accounting/credit-notes?error=invalid-state");
    if (error instanceof NotFoundError) redirect("/app/accounting/credit-notes?error=not-found");
    throw error;
  }

  await logAuditEvent({ organizationId: tenant.organizationId, userId: session?.user?.id ?? null, module: "accounting", action: "credit_note.applied", entityName: "AccountingCreditNote", entityId: creditNote.id, metadata: { invoiceId } });

  revalidatePath("/app/accounting/credit-notes");
  revalidatePath("/app/accounting/invoices");
  redirect("/app/accounting/credit-notes?saved=1");
}

const refundSchema = z.object({ id: cuid, accountId: cuid });

export async function refundExistingCreditNote(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("accounting");
  if (!hasPermission(tenant, PERMISSIONS.ACCOUNTING_RECEIVABLES_MANAGE)) {
    redirect("/app/accounting/credit-notes?error=forbidden");
  }

  const parsed = parseWithSchema(refundSchema, { id: clean(formData.get("id")), accountId: clean(formData.get("accountId")) });
  if (!parsed.success) {
    redirect("/app/accounting/credit-notes?error=missing-fields");
  }
  const { id, accountId } = parsed.data;
  const session = await getServerAuthSession();

  let creditNote;
  try {
    creditNote = await refundCreditNote(tenant.organizationId, id, accountId, session?.user?.id ?? null);
  } catch (error) {
    if (error instanceof AccountingPeriodLockedError) redirect("/app/accounting/credit-notes?error=period-closed");
    if (error instanceof InvalidPaymentError) redirect("/app/accounting/credit-notes?error=invalid-payment");
    if (error instanceof CreditNoteStateError) redirect("/app/accounting/credit-notes?error=invalid-state");
    if (error instanceof NotFoundError) redirect("/app/accounting/credit-notes?error=not-found");
    throw error;
  }

  await logAuditEvent({ organizationId: tenant.organizationId, userId: session?.user?.id ?? null, module: "accounting", action: "credit_note.refunded", entityName: "AccountingCreditNote", entityId: creditNote.id, metadata: { accountId } });

  revalidatePath("/app/accounting/credit-notes");
  revalidatePath("/app/accounting/accounts");
  redirect("/app/accounting/credit-notes?saved=1");
}

const idSchema = z.object({ id: cuid });

export async function voidExistingCreditNote(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("accounting");
  if (!hasPermission(tenant, PERMISSIONS.ACCOUNTING_RECEIVABLES_MANAGE)) {
    redirect("/app/accounting/credit-notes?error=forbidden");
  }

  const parsed = parseWithSchema(idSchema, { id: clean(formData.get("id")) });
  if (!parsed.success) return;
  const { id } = parsed.data;
  const session = await getServerAuthSession();

  let creditNote;
  try {
    creditNote = await voidCreditNote(tenant.organizationId, id);
  } catch (error) {
    if (error instanceof CreditNoteStateError) redirect("/app/accounting/credit-notes?error=invalid-state");
    if (error instanceof NotFoundError) redirect("/app/accounting/credit-notes?error=not-found");
    throw error;
  }

  await logAuditEvent({ organizationId: tenant.organizationId, userId: session?.user?.id ?? null, module: "accounting", action: "credit_note.voided", entityName: "AccountingCreditNote", entityId: creditNote.id });

  revalidatePath("/app/accounting/credit-notes");
  redirect("/app/accounting/credit-notes?saved=1");
}
