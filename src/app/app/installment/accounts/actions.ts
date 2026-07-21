"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import { verifyCurrentPassword } from "@/lib/auth/verify-password";
import {
  createAccount,
  updateAccountDeliveryStatus,
  setAccountStatus,
  reactivateAccount,
  InsufficientInventoryError,
  ReactivationNotEligibleError,
  MinimumDepositError,
  NotFoundError,
} from "@/modules/installment/service";
import type { HirePurchaseAccountStatus } from "@prisma/client";
import { dateInput, moneyAmountNonNegative, parseWithSchema } from "@/lib/validation";
import { z } from "zod";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

const accountSchema = z.object({
  startDate: dateInput,
  initialDeposit: moneyAmountNonNegative.optional(),
});

export async function createInstallmentAccount(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.HIREPURCHASE_ACCOUNTS_MANAGE)) {
    redirect("/app/installment/accounts?error=forbidden");
  }

  const customerId = clean(formData.get("customerId"));
  const productId = clean(formData.get("productId"));
  const inventoryStaffId = clean(formData.get("inventoryStaffId"));
  const startDateRaw = clean(formData.get("startDate"));

  if (!customerId || !productId || !inventoryStaffId || !startDateRaw) {
    redirect("/app/installment/accounts?error=missing-fields");
  }

  const parsed = parseWithSchema(accountSchema, {
    startDate: startDateRaw,
    initialDeposit: clean(formData.get("initialDeposit")) ?? undefined,
  });
  if (!parsed.success) {
    redirect("/app/installment/accounts?error=invalid-input");
  }

  if (parsed.data.startDate > new Date()) {
    redirect("/app/installment/accounts?error=future-date");
  }

  const { startDate, initialDeposit } = parsed.data;

  try {
    await createAccount(tenant.organizationId, { customerId, productId, inventoryStaffId, startDate, initialDeposit });
  } catch (error) {
    if (error instanceof InsufficientInventoryError) {
      redirect("/app/installment/accounts?error=no-stock");
    }
    if (error instanceof MinimumDepositError) {
      redirect("/app/installment/accounts?error=below-minimum-deposit");
    }
    if (error instanceof NotFoundError) redirect("/app/installment/accounts?error=not-found");
    throw error;
  }

  revalidatePath("/app/installment/accounts");
  redirect("/app/installment/accounts?saved=1");
}

export async function markAccountDelivered(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.HIREPURCHASE_ACCOUNTS_MANAGE)) {
    redirect("/app/installment/accounts?error=forbidden");
  }

  const id = clean(formData.get("id"));
  if (!id) return;

  const session = await getServerAuthSession();
  await updateAccountDeliveryStatus(tenant.organizationId, id, session?.user?.name ?? session?.user?.email ?? "unknown");
  revalidatePath("/app/installment/accounts");
  redirect("/app/installment/accounts?saved=1");
}

export async function changeAccountStatus(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.HIREPURCHASE_ACCOUNTS_MANAGE)) {
    redirect("/app/installment/accounts?error=forbidden");
  }

  const id = clean(formData.get("id"));
  const status = clean(formData.get("status")) as HirePurchaseAccountStatus | null;
  if (!id || !status) return;

  await setAccountStatus(tenant.organizationId, id, status);
  revalidatePath("/app/installment/accounts");
  redirect("/app/installment/accounts?saved=1");
}

export async function reactivateInstallmentAccount(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.HIREPURCHASE_ACCOUNTS_MANAGE)) {
    redirect("/app/installment/accounts?error=forbidden");
  }

  const id = clean(formData.get("id"));
  const confirmPassword = clean(formData.get("confirmPassword"));
  if (!id) return;

  const session = await getServerAuthSession();
  if (!session?.user?.id || !confirmPassword || !(await verifyCurrentPassword(session.user.id, confirmPassword))) {
    redirect("/app/installment/accounts?error=wrong-password");
  }

  try {
    await reactivateAccount(tenant.organizationId, id);
  } catch (error) {
    if (error instanceof ReactivationNotEligibleError) {
      redirect("/app/installment/accounts?error=not-eligible");
    }
    throw error;
  }

  revalidatePath("/app/installment/accounts");
  redirect("/app/installment/accounts?saved=1");
}
