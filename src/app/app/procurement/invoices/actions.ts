"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import { logAuditEvent } from "@/lib/audit";
import { cuid, dateInput, moneyAmountNonNegative, parseWithSchema, positiveInt, shortText } from "@/lib/validation";
import { createSupplierInvoice, InvoiceApprovalError, InvoiceMatchError, NotFoundError, recordSupplierPayment, reviewSupplierInvoice, SupplierPaymentError } from "@/modules/procurement/service";

const PATH = "/app/procurement/invoices";
const createSchema = z.object({ vendorId: cuid, orderId: cuid, invoiceNumber: shortText, invoiceDate: dateInput, dueDate: dateInput.optional(), taxCodeId: cuid.nullable().optional(), lines: z.array(z.object({ orderLineId: cuid, quantity: positiveInt, unitCost: moneyAmountNonNegative })).min(1).max(100) });
const reviewSchema = z.object({ invoiceId: cuid, decision: z.enum(["APPROVE", "REJECT"]) });
const paymentSchema = z.object({ invoiceId: cuid, accountId: cuid.optional(), paymentMethod: z.enum(["CASH", "BANK_TRANSFER", "MOBILE_MONEY", "CHEQUE", "OTHER"]), amount: z.coerce.number().positive().transform(String), paymentDate: dateInput, reference: shortText.optional(), notes: z.string().trim().max(1000).optional() });
const clean = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();

export async function createInvoiceAction(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("procurement");
  if (!hasPermission(tenant, PERMISSIONS.PROCUREMENT_INVOICES_MANAGE)) redirect(`${PATH}?error=forbidden`);
  let lines: unknown;
  try { lines = JSON.parse(clean(formData, "linesJson")); } catch { redirect(`${PATH}?error=invalid`); }
  const parsed = parseWithSchema(createSchema, { vendorId: clean(formData, "vendorId"), orderId: clean(formData, "orderId"), invoiceNumber: clean(formData, "invoiceNumber"), invoiceDate: clean(formData, "invoiceDate"), dueDate: clean(formData, "dueDate") || undefined, taxCodeId: clean(formData, "taxCodeId") || null, lines });
  if (!parsed.success) redirect(`${PATH}?error=invalid`);
  const session = await getServerAuthSession();
  try {
    const invoice = await createSupplierInvoice(tenant.organizationId, { ...parsed.data, createdById: session?.user?.id ?? null });
    await logAuditEvent({ organizationId: tenant.organizationId, userId: session?.user?.id ?? null, module: "procurement", action: "supplier_invoice.created", entityName: "ProcurementSupplierInvoice", entityId: invoice.id, metadata: { status: invoice.status } });
  } catch (error) {
    if (error instanceof InvoiceMatchError) redirect(`${PATH}?error=match`);
    if (error instanceof NotFoundError) redirect(`${PATH}?error=not-found`);
    throw error;
  }
  revalidatePath(PATH);
  redirect(`${PATH}?saved=1`);
}

export async function recordSupplierPaymentAction(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("procurement");
  if (!hasPermission(tenant, PERMISSIONS.PROCUREMENT_PAYMENTS_MANAGE)) redirect(`${PATH}?error=forbidden`);
  const parsed = parseWithSchema(paymentSchema, { invoiceId: clean(formData, "invoiceId"), accountId: clean(formData, "accountId") || undefined, paymentMethod: clean(formData, "paymentMethod"), amount: clean(formData, "amount"), paymentDate: clean(formData, "paymentDate"), reference: clean(formData, "reference") || undefined, notes: clean(formData, "notes") || undefined });
  if (!parsed.success) redirect(`${PATH}?error=invalid-payment`);
  const session = await getServerAuthSession();
  if (!session?.user?.id) redirect("/login");
  try {
    const payment = await recordSupplierPayment(tenant.organizationId, { ...parsed.data, createdById: session.user.id });
    await logAuditEvent({ organizationId: tenant.organizationId, userId: session.user.id, module: "procurement", action: "supplier_payment.recorded", entityName: "ProcurementSupplierPayment", entityId: payment.id, metadata: { invoiceId: parsed.data.invoiceId, amount: parsed.data.amount } });
  } catch (error) {
    if (error instanceof SupplierPaymentError) redirect(`${PATH}?error=payment`);
    throw error;
  }
  revalidatePath(PATH);
  revalidatePath("/app/accounting/journal");
  redirect(`${PATH}?saved=payment`);
}

export async function reviewInvoiceAction(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("procurement");
  if (!hasPermission(tenant, PERMISSIONS.PROCUREMENT_INVOICES_APPROVE)) redirect(`${PATH}?error=forbidden`);
  const parsed = parseWithSchema(reviewSchema, { invoiceId: clean(formData, "invoiceId"), decision: clean(formData, "decision") });
  if (!parsed.success) redirect(`${PATH}?error=invalid`);
  const session = await getServerAuthSession();
  if (!session?.user?.id) redirect("/login");
  try {
    const invoice = await reviewSupplierInvoice(tenant.organizationId, parsed.data.invoiceId, session.user.id, parsed.data.decision);
    await logAuditEvent({ organizationId: tenant.organizationId, userId: session.user.id, module: "procurement", action: parsed.data.decision === "APPROVE" ? "supplier_invoice.approved" : "supplier_invoice.rejected", entityName: "ProcurementSupplierInvoice", entityId: invoice.id });
  } catch (error) {
    if (error instanceof InvoiceApprovalError) redirect(`${PATH}?error=approval`);
    throw error;
  }
  revalidatePath(PATH);
  redirect(`${PATH}?saved=1`);
}
