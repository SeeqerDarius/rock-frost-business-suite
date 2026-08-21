"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import {
  createPettyCashFund,
  recordPettyCashExpense,
  replenishPettyCashFund,
  closePettyCashFund,
  NotFoundError,
  InvalidPaymentError,
  PettyCashStateError,
  AccountingPeriodLockedError,
} from "@/modules/accounting/service";
import { moneyAmountPositive, shortText, longText, cuid, dateInput, parseWithSchema } from "@/lib/validation";
import { logAuditEvent } from "@/lib/audit";

const PATH = "/app/accounting/petty-cash";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

async function auth() {
  const tenant = await requireModuleAccess("accounting");
  if (!hasPermission(tenant, PERMISSIONS.ACCOUNTING_CASHBOOK_MANAGE)) redirect(`${PATH}?error=forbidden`);
  return tenant;
}

function fail(error: unknown): never {
  if (error instanceof AccountingPeriodLockedError) redirect(`${PATH}?error=period-closed`);
  if (error instanceof PettyCashStateError) redirect(`${PATH}?error=invalid-state`);
  if (error instanceof InvalidPaymentError) redirect(`${PATH}?error=invalid-amount`);
  if (error instanceof NotFoundError) redirect(`${PATH}?error=not-found`);
  throw error;
}

const createFundSchema = z.object({ name: shortText, custodianName: shortText, floatAmount: moneyAmountPositive });

export async function createFundAction(formData: FormData): Promise<void> {
  const tenant = await auth();
  const parsed = parseWithSchema(createFundSchema, {
    name: clean(formData.get("name")),
    custodianName: clean(formData.get("custodianName")),
    floatAmount: clean(formData.get("floatAmount")),
  });
  if (!parsed.success) redirect(`${PATH}?error=missing-fields`);

  const session = await getServerAuthSession();
  let fund;
  try {
    fund = await createPettyCashFund(tenant.organizationId, parsed.data, session?.user?.id ?? null);
  } catch (error) {
    fail(error);
  }
  await logAuditEvent({
    organizationId: tenant.organizationId,
    userId: session?.user?.id ?? null,
    module: "accounting",
    action: "petty_cash.fund_created",
    entityName: "AccountingPettyCashFund",
    entityId: fund.id,
  });

  revalidatePath(PATH);
  revalidatePath("/app/accounting/accounts");
  redirect(`${PATH}?saved=1`);
}

const recordExpenseSchema = z.object({
  fundId: cuid,
  amount: moneyAmountPositive,
  description: shortText,
  expenseCategoryId: cuid.nullable().optional(),
  expenseDate: dateInput.nullable().optional(),
});

export async function recordExpenseAction(formData: FormData): Promise<void> {
  const tenant = await auth();
  const parsed = parseWithSchema(recordExpenseSchema, {
    fundId: clean(formData.get("fundId")),
    amount: clean(formData.get("amount")),
    description: clean(formData.get("description")),
    expenseCategoryId: clean(formData.get("expenseCategoryId")),
    expenseDate: clean(formData.get("expenseDate")),
  });
  if (!parsed.success) redirect(`${PATH}?error=missing-fields`);

  const session = await getServerAuthSession();
  const { fundId, ...data } = parsed.data;
  try {
    await recordPettyCashExpense(
      tenant.organizationId,
      fundId,
      { amount: data.amount, description: data.description, expenseCategoryId: data.expenseCategoryId ?? null, expenseDate: data.expenseDate ?? undefined },
      session?.user?.id ?? null,
    );
  } catch (error) {
    fail(error);
  }

  revalidatePath(PATH);
  revalidatePath("/app/accounting/accounts");
  redirect(`${PATH}?saved=1`);
}

const replenishSchema = z.object({ fundId: cuid, amount: moneyAmountPositive.nullable().optional(), description: longText.nullable().optional() });

export async function replenishFundAction(formData: FormData): Promise<void> {
  const tenant = await auth();
  const parsed = parseWithSchema(replenishSchema, {
    fundId: clean(formData.get("fundId")),
    amount: clean(formData.get("amount")),
    description: clean(formData.get("description")),
  });
  if (!parsed.success) redirect(`${PATH}?error=missing-fields`);

  const session = await getServerAuthSession();
  const { fundId, ...data } = parsed.data;
  try {
    await replenishPettyCashFund(tenant.organizationId, fundId, { amount: data.amount ?? undefined, description: data.description }, session?.user?.id ?? null);
  } catch (error) {
    fail(error);
  }

  revalidatePath(PATH);
  revalidatePath("/app/accounting/accounts");
  redirect(`${PATH}?saved=1`);
}

const fundIdSchema = z.object({ fundId: cuid });

export async function closeFundAction(formData: FormData): Promise<void> {
  const tenant = await auth();
  const parsed = parseWithSchema(fundIdSchema, { fundId: clean(formData.get("fundId")) });
  if (!parsed.success) redirect(`${PATH}?error=missing-fields`);

  const session = await getServerAuthSession();
  try {
    await closePettyCashFund(tenant.organizationId, parsed.data.fundId, session?.user?.id ?? null);
  } catch (error) {
    fail(error);
  }

  revalidatePath(PATH);
  revalidatePath("/app/accounting/accounts");
  redirect(`${PATH}?saved=1`);
}
