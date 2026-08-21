"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import {
  createExpense,
  approveExpense,
  rejectExpense,
  payExpense,
  ExpenseStateError,
  NotFoundError,
  AccountingPeriodLockedError,
} from "@/modules/accounting/service";
import { moneyAmount, shortText, longText, cuid, dateInput, parseWithSchema } from "@/lib/validation";
import { logAuditEvent } from "@/lib/audit";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

const createExpenseSchema = z.object({
  vendorName: shortText,
  categoryId: cuid.nullable().optional(),
  amount: moneyAmount,
  expenseDate: dateInput,
  notes: longText.nullable().optional(),
});

export async function createNewExpense(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("accounting");
  if (!hasPermission(tenant, PERMISSIONS.ACCOUNTING_EXPENSES_MANAGE)) {
    redirect("/app/accounting/expenses?error=forbidden");
  }

  const parsed = parseWithSchema(createExpenseSchema, {
    vendorName: clean(formData.get("vendorName")),
    categoryId: clean(formData.get("categoryId")),
    amount: clean(formData.get("amount")),
    expenseDate: clean(formData.get("expenseDate")),
    notes: clean(formData.get("notes")),
  });
  if (!parsed.success) {
    redirect("/app/accounting/expenses?error=missing-fields");
  }
  const { vendorName, categoryId, amount, expenseDate, notes } = parsed.data;

  const session = await getServerAuthSession();
  await createExpense(
    tenant.organizationId,
    {
      vendorName,
      categoryId: categoryId ?? null,
      amount,
      expenseDate,
      notes: notes ?? null,
    },
    session?.user?.id ?? null,
  );

  revalidatePath("/app/accounting/expenses");
  redirect("/app/accounting/expenses?saved=1");
}

const idSchema = z.object({ id: cuid });

export async function approveExistingExpense(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("accounting");
  if (!hasPermission(tenant, PERMISSIONS.ACCOUNTING_EXPENSES_MANAGE)) {
    redirect("/app/accounting/expenses?error=forbidden");
  }
  const parsed = parseWithSchema(idSchema, { id: clean(formData.get("id")) });
  if (!parsed.success) return;
  const { id } = parsed.data;

  try {
    await approveExpense(tenant.organizationId, id);
  } catch (error) {
    if (error instanceof ExpenseStateError) redirect("/app/accounting/expenses?error=invalid-state");
    if (error instanceof NotFoundError) redirect("/app/accounting/expenses?error=not-found");
    throw error;
  }

  revalidatePath("/app/accounting/expenses");
  redirect("/app/accounting/expenses?saved=1");
}

export async function rejectExistingExpense(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("accounting");
  if (!hasPermission(tenant, PERMISSIONS.ACCOUNTING_EXPENSES_MANAGE)) {
    redirect("/app/accounting/expenses?error=forbidden");
  }
  const parsed = parseWithSchema(idSchema, { id: clean(formData.get("id")) });
  if (!parsed.success) return;
  const { id } = parsed.data;

  try {
    await rejectExpense(tenant.organizationId, id);
  } catch (error) {
    if (error instanceof ExpenseStateError) redirect("/app/accounting/expenses?error=invalid-state");
    if (error instanceof NotFoundError) redirect("/app/accounting/expenses?error=not-found");
    throw error;
  }

  revalidatePath("/app/accounting/expenses");
  redirect("/app/accounting/expenses?saved=1");
}

const payExpenseSchema = z.object({ id: cuid, paymentDate: dateInput });

export async function payExistingExpense(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("accounting");
  if (!hasPermission(tenant, PERMISSIONS.ACCOUNTING_EXPENSES_MANAGE)) {
    redirect("/app/accounting/expenses?error=forbidden");
  }

  const parsed = parseWithSchema(payExpenseSchema, {
    id: clean(formData.get("id")),
    paymentDate: clean(formData.get("paymentDate")),
  });
  if (!parsed.success) {
    redirect("/app/accounting/expenses?error=missing-fields");
  }
  const { id, paymentDate } = parsed.data;

  const session = await getServerAuthSession();

  let expense;
  try {
    expense = await payExpense(tenant.organizationId, id, paymentDate);
  } catch (error) {
    if (error instanceof AccountingPeriodLockedError) redirect("/app/accounting/expenses?error=period-closed");
    if (error instanceof ExpenseStateError) {
      await logAuditEvent({
        organizationId: tenant.organizationId,
        userId: session?.user?.id ?? null,
        module: "accounting",
        action: "expense.paid",
        entityName: "AccountingExpense",
        entityId: id,
        status: "FAILURE",
        metadata: { reason: error.constructor.name },
      });
      redirect("/app/accounting/expenses?error=invalid-state");
    }
    if (error instanceof NotFoundError) redirect("/app/accounting/expenses?error=not-found");
    throw error;
  }

  await logAuditEvent({
    organizationId: tenant.organizationId,
    userId: session?.user?.id ?? null,
    module: "accounting",
    action: "expense.paid",
    entityName: "AccountingExpense",
    entityId: expense.id,
  });

  revalidatePath("/app/accounting/expenses");
  revalidatePath("/app/accounting/accounts");
  redirect("/app/accounting/expenses?saved=1");
}
