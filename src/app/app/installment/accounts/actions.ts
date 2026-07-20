"use server";

import { redirect } from "next/navigation";
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
} from "@/modules/installment/service";
import type { HirePurchaseAccountStatus } from "@prisma/client";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

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

  const startDate = new Date(`${startDateRaw}T00:00:00`);
  if (startDate > new Date()) {
    redirect("/app/installment/accounts?error=future-date");
  }

  const initialDeposit = clean(formData.get("initialDeposit")) ?? undefined;

  try {
    await createAccount(tenant.organizationId, { customerId, productId, inventoryStaffId, startDate, initialDeposit });
  } catch (error) {
    if (error instanceof InsufficientInventoryError) {
      redirect("/app/installment/accounts?error=no-stock");
    }
    if (error instanceof MinimumDepositError) {
      redirect("/app/installment/accounts?error=below-minimum-deposit");
    }
    throw error;
  }

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

  redirect("/app/installment/accounts?saved=1");
}
