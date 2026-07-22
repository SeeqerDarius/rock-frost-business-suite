"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import {
  createInvoice,
  markInvoiceSent,
  recordInvoicePayment,
  voidInvoice,
  InvoiceStateError,
  InvalidPaymentError,
  NotFoundError,
} from "@/modules/accounting/service";
import { moneyAmount, shortText, longText, email, cuid, dateInput, parseWithSchema } from "@/lib/validation";
import { logAuditEvent } from "@/lib/audit";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

const createInvoiceSchema = z.object({
  customerName: shortText,
  customerEmail: email.nullable().optional(),
  description: longText.nullable().optional(),
  amount: moneyAmount,
  issueDate: dateInput,
  dueDate: dateInput,
});

export async function createNewInvoice(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.ACCOUNTING_INVOICES_MANAGE)) {
    redirect("/app/accounting/invoices?error=forbidden");
  }

  const parsed = parseWithSchema(createInvoiceSchema, {
    customerName: clean(formData.get("customerName")),
    customerEmail: clean(formData.get("customerEmail")),
    description: clean(formData.get("description")),
    amount: clean(formData.get("amount")),
    issueDate: clean(formData.get("issueDate")),
    dueDate: clean(formData.get("dueDate")),
  });
  if (!parsed.success) {
    redirect("/app/accounting/invoices?error=missing-fields");
  }
  const { customerName, customerEmail, description, amount, issueDate, dueDate } = parsed.data;

  const session = await getServerAuthSession();
  await createInvoice(
    tenant.organizationId,
    {
      customerName,
      customerEmail: customerEmail ?? null,
      description: description ?? null,
      amount,
      issueDate,
      dueDate,
    },
    session?.user?.id ?? null,
  );

  revalidatePath("/app/accounting/invoices");
  redirect("/app/accounting/invoices?saved=1");
}

const idSchema = z.object({ id: cuid });

export async function sendInvoice(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.ACCOUNTING_INVOICES_MANAGE)) {
    redirect("/app/accounting/invoices?error=forbidden");
  }

  const parsed = parseWithSchema(idSchema, { id: clean(formData.get("id")) });
  if (!parsed.success) return;
  const { id } = parsed.data;

  const session = await getServerAuthSession();

  let invoice;
  try {
    invoice = await markInvoiceSent(tenant.organizationId, id);
  } catch (error) {
    if (error instanceof InvoiceStateError) {
      redirect("/app/accounting/invoices?error=invalid-state");
    }
    if (error instanceof NotFoundError) redirect("/app/accounting/invoices?error=not-found");
    throw error;
  }

  await logAuditEvent({
    organizationId: tenant.organizationId,
    userId: session?.user?.id ?? null,
    module: "accounting",
    action: "invoice.sent",
    entityName: "AccountingInvoice",
    entityId: invoice.id,
  });

  revalidatePath("/app/accounting/invoices");
  revalidatePath("/app/accounting/accounts");
  redirect("/app/accounting/invoices?saved=1");
}

const payInvoiceSchema = z.object({ id: cuid, amount: moneyAmount, paymentDate: dateInput });

export async function payInvoice(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.ACCOUNTING_INVOICES_MANAGE)) {
    redirect("/app/accounting/invoices?error=forbidden");
  }

  const parsed = parseWithSchema(payInvoiceSchema, {
    id: clean(formData.get("id")),
    amount: clean(formData.get("amount")),
    paymentDate: clean(formData.get("paymentDate")),
  });
  if (!parsed.success) {
    redirect("/app/accounting/invoices?error=missing-fields");
  }
  const { id, amount, paymentDate } = parsed.data;

  const session = await getServerAuthSession();

  let invoice;
  try {
    invoice = await recordInvoicePayment(tenant.organizationId, id, amount, paymentDate);
  } catch (error) {
    if (error instanceof InvalidPaymentError) {
      await logAuditEvent({
        organizationId: tenant.organizationId,
        userId: session?.user?.id ?? null,
        module: "accounting",
        action: "invoice.payment",
        entityName: "AccountingInvoice",
        entityId: id,
        status: "FAILURE",
        metadata: { reason: error.constructor.name },
      });
      redirect("/app/accounting/invoices?error=invalid-payment");
    }
    if (error instanceof InvoiceStateError) {
      redirect("/app/accounting/invoices?error=invalid-state");
    }
    if (error instanceof NotFoundError) redirect("/app/accounting/invoices?error=not-found");
    throw error;
  }

  await logAuditEvent({
    organizationId: tenant.organizationId,
    userId: session?.user?.id ?? null,
    module: "accounting",
    action: "invoice.payment",
    entityName: "AccountingInvoice",
    entityId: invoice.id,
    metadata: { amount },
  });

  revalidatePath("/app/accounting/invoices");
  revalidatePath("/app/accounting/accounts");
  redirect("/app/accounting/invoices?saved=1");
}

export async function voidExistingInvoice(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.ACCOUNTING_INVOICES_MANAGE)) {
    redirect("/app/accounting/invoices?error=forbidden");
  }

  const parsed = parseWithSchema(idSchema, { id: clean(formData.get("id")) });
  if (!parsed.success) return;
  const { id } = parsed.data;

  const session = await getServerAuthSession();

  let invoice;
  try {
    invoice = await voidInvoice(tenant.organizationId, id);
  } catch (error) {
    if (error instanceof InvoiceStateError) {
      redirect("/app/accounting/invoices?error=has-payment");
    }
    if (error instanceof NotFoundError) redirect("/app/accounting/invoices?error=not-found");
    throw error;
  }

  await logAuditEvent({
    organizationId: tenant.organizationId,
    userId: session?.user?.id ?? null,
    module: "accounting",
    action: "invoice.voided",
    entityName: "AccountingInvoice",
    entityId: invoice.id,
  });

  revalidatePath("/app/accounting/invoices");
  redirect("/app/accounting/invoices?saved=1");
}
