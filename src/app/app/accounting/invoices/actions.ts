"use server";

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

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

export async function createNewInvoice(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.ACCOUNTING_INVOICES_MANAGE)) {
    redirect("/app/accounting/invoices?error=forbidden");
  }

  const customerName = clean(formData.get("customerName"));
  const amount = clean(formData.get("amount"));
  const issueDateRaw = clean(formData.get("issueDate"));
  const dueDateRaw = clean(formData.get("dueDate"));

  if (!customerName || !amount || !issueDateRaw || !dueDateRaw) {
    redirect("/app/accounting/invoices?error=missing-fields");
  }

  const session = await getServerAuthSession();
  await createInvoice(
    tenant.organizationId,
    {
      customerName,
      customerEmail: clean(formData.get("customerEmail")),
      description: clean(formData.get("description")),
      amount,
      issueDate: new Date(`${issueDateRaw}T00:00:00`),
      dueDate: new Date(`${dueDateRaw}T00:00:00`),
    },
    session?.user?.id ?? null,
  );

  revalidatePath("/app/accounting/invoices");
  redirect("/app/accounting/invoices?saved=1");
}

export async function sendInvoice(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.ACCOUNTING_INVOICES_MANAGE)) {
    redirect("/app/accounting/invoices?error=forbidden");
  }

  const id = clean(formData.get("id"));
  if (!id) return;

  try {
    await markInvoiceSent(tenant.organizationId, id);
  } catch (error) {
    if (error instanceof InvoiceStateError) {
      redirect("/app/accounting/invoices?error=invalid-state");
    }
    if (error instanceof NotFoundError) redirect("/app/accounting/invoices?error=not-found");
    throw error;
  }

  revalidatePath("/app/accounting/invoices");
  revalidatePath("/app/accounting/accounts");
  redirect("/app/accounting/invoices?saved=1");
}

export async function payInvoice(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.ACCOUNTING_INVOICES_MANAGE)) {
    redirect("/app/accounting/invoices?error=forbidden");
  }

  const id = clean(formData.get("id"));
  const amount = clean(formData.get("amount"));
  const paymentDateRaw = clean(formData.get("paymentDate"));
  if (!id || !amount || !paymentDateRaw) {
    redirect("/app/accounting/invoices?error=missing-fields");
  }

  try {
    await recordInvoicePayment(tenant.organizationId, id, amount, new Date(`${paymentDateRaw}T00:00:00`));
  } catch (error) {
    if (error instanceof InvoiceStateError) {
      redirect("/app/accounting/invoices?error=invalid-state");
    }
    if (error instanceof InvalidPaymentError) redirect("/app/accounting/invoices?error=invalid-payment");
    if (error instanceof NotFoundError) redirect("/app/accounting/invoices?error=not-found");
    throw error;
  }

  revalidatePath("/app/accounting/invoices");
  revalidatePath("/app/accounting/accounts");
  redirect("/app/accounting/invoices?saved=1");
}

export async function voidExistingInvoice(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.ACCOUNTING_INVOICES_MANAGE)) {
    redirect("/app/accounting/invoices?error=forbidden");
  }

  const id = clean(formData.get("id"));
  if (!id) return;

  try {
    await voidInvoice(tenant.organizationId, id);
  } catch (error) {
    if (error instanceof InvoiceStateError) {
      redirect("/app/accounting/invoices?error=has-payment");
    }
    if (error instanceof NotFoundError) redirect("/app/accounting/invoices?error=not-found");
    throw error;
  }

  revalidatePath("/app/accounting/invoices");
  redirect("/app/accounting/invoices?saved=1");
}
