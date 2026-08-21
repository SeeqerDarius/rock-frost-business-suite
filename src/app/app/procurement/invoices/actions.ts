"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import { logAuditEvent } from "@/lib/audit";
import { cuid, dateInput, moneyAmountNonNegative, parseWithSchema, positiveInt, shortText } from "@/lib/validation";
import { createSupplierInvoice, InvoiceApprovalError, InvoiceMatchError, NotFoundError, reviewSupplierInvoice } from "@/modules/procurement/service";

const PATH = "/app/procurement/invoices";
const createSchema = z.object({ vendorId: cuid, orderId: cuid, invoiceNumber: shortText, invoiceDate: dateInput, lines: z.array(z.object({ orderLineId: cuid, quantity: positiveInt, unitCost: moneyAmountNonNegative })).min(1).max(100) });
const reviewSchema = z.object({ invoiceId: cuid, decision: z.enum(["APPROVE", "REJECT"]) });
const clean = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();

export async function createInvoiceAction(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("procurement");
  if (!hasPermission(tenant, PERMISSIONS.PROCUREMENT_INVOICES_MANAGE)) redirect(`${PATH}?error=forbidden`);
  let lines: unknown;
  try { lines = JSON.parse(clean(formData, "linesJson")); } catch { redirect(`${PATH}?error=invalid`); }
  const parsed = parseWithSchema(createSchema, { vendorId: clean(formData, "vendorId"), orderId: clean(formData, "orderId"), invoiceNumber: clean(formData, "invoiceNumber"), invoiceDate: clean(formData, "invoiceDate"), lines });
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
