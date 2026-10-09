"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import {
  createBill,
  approveBill,
  recordBillPayment,
  voidBill,
  createAccountingAttachment,
  deleteAccountingAttachment,
  BillStateError,
  InvalidPaymentError,
  InvalidLineItemsError,
  NotFoundError,
  AccountingPeriodLockedError,
  type LineItemInput,
} from "@/modules/accounting/service";
import { moneyAmount, shortText, longText, email, cuid, dateInput, parseIndexedFormRows, currencyCode, exchangeRateInput, parseWithSchema } from "@/lib/validation";
import { ExchangeRateError } from "@/modules/globalization/fx";
import { TaxConfigurationError as TaxEngineError } from "@/modules/tax/service";
import { logAuditEvent } from "@/lib/audit";
import { accountingAttachmentFileData } from "@/lib/accounting-attachment-file";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

const createBillSchema = z.object({
  contactId: cuid.nullable().optional(),
  supplierName: shortText,
  supplierEmail: email.nullable().optional(),
  description: longText.nullable().optional(),
  expenseAccountId: cuid,
  billDate: dateInput,
  dueDate: dateInput,
  taxCodeId: cuid.nullable().optional(),
  taxRuleId: cuid.nullable().optional(),
  currency: currencyCode.nullable().optional(),
  exchangeRate: exchangeRateInput.nullable().optional(),
});

export async function createNewBill(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("accounting");
  if (!hasPermission(tenant, PERMISSIONS.ACCOUNTING_BILLS_MANAGE)) {
    redirect("/app/accounting/bills?error=forbidden");
  }

  const parsed = parseWithSchema(createBillSchema, {
    contactId: clean(formData.get("contactId")),
    supplierName: clean(formData.get("supplierName")),
    supplierEmail: clean(formData.get("supplierEmail")),
    description: clean(formData.get("description")),
    expenseAccountId: clean(formData.get("expenseAccountId")),
    billDate: clean(formData.get("billDate")),
    dueDate: clean(formData.get("dueDate")),
    // A "rule:<id>" value selects a tax engine rule instead of a legacy tax code.
    taxCodeId: clean(formData.get("taxCodeId"))?.startsWith("rule:") ? null : clean(formData.get("taxCodeId")),
    taxRuleId: clean(formData.get("taxCodeId"))?.startsWith("rule:") ? clean(formData.get("taxCodeId"))!.slice(5) : null,
    currency: clean(formData.get("currency")),
    exchangeRate: clean(formData.get("exchangeRate")),
  });
  if (!parsed.success) {
    redirect("/app/accounting/bills?error=missing-fields");
  }
  const { contactId, supplierName, supplierEmail, description, expenseAccountId, billDate, dueDate, taxCodeId, currency, exchangeRate } = parsed.data;
  const lines = parseIndexedFormRows(formData, "lines", ["description", "quantity", "unitPrice", "taxRuleId"]) as unknown as LineItemInput[];

  const session = await getServerAuthSession();
  try {
    await createBill(
      tenant.organizationId,
      {
        contactId: contactId ?? null,
        supplierName,
        supplierEmail: supplierEmail ?? null,
        description: description ?? null,
        expenseAccountId,
        lines,
        billDate,
        dueDate,
        taxCodeId: taxCodeId ?? null,
        taxRuleId: parsed.data.taxRuleId ?? null,
        pricesIncludeTax: formData.get("pricesIncludeTax") === "on",
        currency: currency ?? null,
        exchangeRate: exchangeRate ?? null,
      },
      session?.user?.id ?? null,
    );
  } catch (error) {
    if (error instanceof InvalidLineItemsError) redirect("/app/accounting/bills?error=invalid-lines");
    if (error instanceof ExchangeRateError) redirect("/app/accounting/bills?error=fx-rate");
    if (error instanceof TaxEngineError) redirect("/app/accounting/bills?error=tax-rule");
    if (error instanceof NotFoundError) redirect("/app/accounting/bills?error=not-found");
    throw error;
  }

  revalidatePath("/app/accounting/bills");
  redirect("/app/accounting/bills?saved=1");
}

const idSchema = z.object({ id: cuid });

export async function approveExistingBill(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("accounting");
  if (!hasPermission(tenant, PERMISSIONS.ACCOUNTING_BILLS_MANAGE)) {
    redirect("/app/accounting/bills?error=forbidden");
  }

  const parsed = parseWithSchema(idSchema, { id: clean(formData.get("id")) });
  if (!parsed.success) return;
  const { id } = parsed.data;
  const session = await getServerAuthSession();

  let bill;
  try {
    bill = await approveBill(tenant.organizationId, id, session?.user?.id ?? null);
  } catch (error) {
    if (error instanceof AccountingPeriodLockedError) redirect("/app/accounting/bills?error=period-closed");
    if (error instanceof BillStateError) redirect("/app/accounting/bills?error=invalid-state");
    if (error instanceof NotFoundError) redirect("/app/accounting/bills?error=not-found");
    throw error;
  }

  await logAuditEvent({ organizationId: tenant.organizationId, userId: session?.user?.id ?? null, module: "accounting", action: "bill.approved", entityName: "AccountingBill", entityId: bill.id });

  revalidatePath("/app/accounting/bills");
  revalidatePath("/app/accounting/accounts");
  redirect("/app/accounting/bills?saved=1");
}

const payBillSchema = z.object({ id: cuid, amount: moneyAmount, paymentDate: dateInput, accountId: cuid, paymentMethod: z.enum(["CASH", "BANK_TRANSFER", "MOBILE_MONEY", "CHEQUE", "CARD", "OTHER"]), reference: shortText.nullable().optional(), notes: longText.nullable().optional(), exchangeRate: exchangeRateInput.nullable().optional() });

export async function payBill(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("accounting");
  if (!hasPermission(tenant, PERMISSIONS.ACCOUNTING_PAYABLES_MANAGE)) {
    redirect("/app/accounting/bills?error=forbidden");
  }

  const parsed = parseWithSchema(payBillSchema, {
    id: clean(formData.get("id")),
    amount: clean(formData.get("amount")),
    paymentDate: clean(formData.get("paymentDate")),
    accountId: clean(formData.get("accountId")),
    paymentMethod: clean(formData.get("paymentMethod")),
    reference: clean(formData.get("reference")),
    notes: clean(formData.get("notes")),
  });
  if (!parsed.success) {
    redirect("/app/accounting/bills?error=missing-fields");
  }
  const { id, amount, paymentDate, accountId, paymentMethod, reference, notes, exchangeRate } = parsed.data;
  const session = await getServerAuthSession();

  let result;
  try {
    result = await recordBillPayment(tenant.organizationId, id, { amount, paymentDate, accountId, paymentMethod, reference, notes, exchangeRate: exchangeRate ?? null, createdById: session?.user?.id ?? null });
  } catch (error) {
    if (error instanceof AccountingPeriodLockedError) redirect("/app/accounting/bills?error=period-closed");
    if (error instanceof InvalidPaymentError) redirect("/app/accounting/bills?error=invalid-payment");
    if (error instanceof ExchangeRateError) redirect("/app/accounting/bills?error=fx-rate");
    if (error instanceof BillStateError) redirect("/app/accounting/bills?error=invalid-state");
    if (error instanceof NotFoundError) redirect("/app/accounting/bills?error=not-found");
    throw error;
  }

  await logAuditEvent({ organizationId: tenant.organizationId, userId: session?.user?.id ?? null, module: "accounting", action: "bill.payment", entityName: "AccountingBill", entityId: result.bill.id, metadata: { amount, paymentMethod, accountId } });

  revalidatePath("/app/accounting/bills");
  revalidatePath("/app/accounting/accounts");
  redirect("/app/accounting/bills?saved=1");
}

export async function voidExistingBill(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("accounting");
  if (!hasPermission(tenant, PERMISSIONS.ACCOUNTING_BILLS_MANAGE)) {
    redirect("/app/accounting/bills?error=forbidden");
  }

  const parsed = parseWithSchema(idSchema, { id: clean(formData.get("id")) });
  if (!parsed.success) return;
  const { id } = parsed.data;
  const session = await getServerAuthSession();

  let bill;
  try {
    bill = await voidBill(tenant.organizationId, id);
  } catch (error) {
    if (error instanceof AccountingPeriodLockedError) redirect("/app/accounting/bills?error=period-closed");
    if (error instanceof BillStateError) redirect("/app/accounting/bills?error=has-payment");
    if (error instanceof NotFoundError) redirect("/app/accounting/bills?error=not-found");
    throw error;
  }

  await logAuditEvent({ organizationId: tenant.organizationId, userId: session?.user?.id ?? null, module: "accounting", action: "bill.voided", entityName: "AccountingBill", entityId: bill.id });

  revalidatePath("/app/accounting/bills");
  redirect("/app/accounting/bills?saved=1");
}

export async function uploadBillAttachment(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("accounting");
  if (!hasPermission(tenant, PERMISSIONS.ACCOUNTING_BILLS_MANAGE)) {
    redirect("/app/accounting/bills?error=forbidden");
  }
  const billId = clean(formData.get("billId"));
  if (!billId) redirect("/app/accounting/bills?error=missing-fields");
  const file = formData.get("file");
  if (!(file instanceof File) || !file.size) redirect("/app/accounting/bills?error=missing-file");

  const session = await getServerAuthSession();
  try {
    const fileData = await accountingAttachmentFileData(file);
    if (!fileData) redirect("/app/accounting/bills?error=missing-file");
    await createAccountingAttachment(tenant.organizationId, {
      entityType: "BILL",
      entityId: billId,
      fileName: fileData.fileName,
      mimeType: fileData.mimeType,
      size: fileData.size,
      dataUrl: fileData.dataUrl,
      caption: clean(formData.get("caption")),
      uploadedById: session?.user?.id ?? null,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "invalid-accounting-attachment") {
      redirect("/app/accounting/bills?error=invalid-attachment");
    }
    throw error;
  }

  revalidatePath("/app/accounting/bills");
  redirect("/app/accounting/bills?saved=1");
}

export async function deleteBillAttachmentAction(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("accounting");
  if (!hasPermission(tenant, PERMISSIONS.ACCOUNTING_BILLS_MANAGE)) {
    redirect("/app/accounting/bills?error=forbidden");
  }
  const parsed = parseWithSchema(idSchema, { id: clean(formData.get("id")) });
  if (!parsed.success) return;
  try {
    await deleteAccountingAttachment(tenant.organizationId, parsed.data.id);
  } catch (error) {
    if (error instanceof NotFoundError) redirect("/app/accounting/bills?error=not-found");
    throw error;
  }
  revalidatePath("/app/accounting/bills");
  redirect("/app/accounting/bills?saved=1");
}
