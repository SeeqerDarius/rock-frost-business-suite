"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import { createExpense, approveExpense, rejectExpense, payExpense, ExpenseStateError } from "@/modules/accounting/service";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

export async function createNewExpense(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.ACCOUNTING_EXPENSES_MANAGE)) {
    redirect("/app/accounting/expenses?error=forbidden");
  }

  const vendorName = clean(formData.get("vendorName"));
  const amount = clean(formData.get("amount"));
  const expenseDateRaw = clean(formData.get("expenseDate"));
  if (!vendorName || !amount || !expenseDateRaw) {
    redirect("/app/accounting/expenses?error=missing-fields");
  }

  const session = await getServerAuthSession();
  await createExpense(
    tenant.organizationId,
    {
      vendorName,
      categoryId: clean(formData.get("categoryId")),
      amount,
      expenseDate: new Date(`${expenseDateRaw}T00:00:00`),
      notes: clean(formData.get("notes")),
    },
    session?.user?.id ?? null,
  );

  revalidatePath("/app/accounting/expenses");
  redirect("/app/accounting/expenses?saved=1");
}

export async function approveExistingExpense(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.ACCOUNTING_EXPENSES_MANAGE)) {
    redirect("/app/accounting/expenses?error=forbidden");
  }
  const id = clean(formData.get("id"));
  if (!id) return;

  try {
    await approveExpense(tenant.organizationId, id);
  } catch (error) {
    if (error instanceof ExpenseStateError) redirect("/app/accounting/expenses?error=invalid-state");
    throw error;
  }

  revalidatePath("/app/accounting/expenses");
  redirect("/app/accounting/expenses?saved=1");
}

export async function rejectExistingExpense(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.ACCOUNTING_EXPENSES_MANAGE)) {
    redirect("/app/accounting/expenses?error=forbidden");
  }
  const id = clean(formData.get("id"));
  if (!id) return;

  try {
    await rejectExpense(tenant.organizationId, id);
  } catch (error) {
    if (error instanceof ExpenseStateError) redirect("/app/accounting/expenses?error=invalid-state");
    throw error;
  }

  revalidatePath("/app/accounting/expenses");
  redirect("/app/accounting/expenses?saved=1");
}

export async function payExistingExpense(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.ACCOUNTING_EXPENSES_MANAGE)) {
    redirect("/app/accounting/expenses?error=forbidden");
  }
  const id = clean(formData.get("id"));
  const paymentDateRaw = clean(formData.get("paymentDate"));
  if (!id || !paymentDateRaw) {
    redirect("/app/accounting/expenses?error=missing-fields");
  }

  try {
    await payExpense(tenant.organizationId, id, new Date(`${paymentDateRaw}T00:00:00`));
  } catch (error) {
    if (error instanceof ExpenseStateError) redirect("/app/accounting/expenses?error=invalid-state");
    throw error;
  }

  revalidatePath("/app/accounting/expenses");
  revalidatePath("/app/accounting/accounts");
  redirect("/app/accounting/expenses?saved=1");
}
