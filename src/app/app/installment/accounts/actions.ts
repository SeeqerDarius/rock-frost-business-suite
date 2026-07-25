"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { resolveInstallmentAccessScope } from "@/modules/installment/access";
import { getServerAuthSession } from "@/lib/auth/session";
import { verifyCurrentPassword } from "@/lib/auth/verify-password";
import {
  createAccount,
  updateAccountDeliveryStatus,
  setAccountStatus,
  reactivateAccount,
  updateAccountPrice,
  updateAccountProduct,
  InvalidAccountPriceError,
  ReactivationNotEligibleError,
  MinimumDepositError,
  NotFoundError,
} from "@/modules/installment/service";
import type { HirePurchaseAccountStatus } from "@prisma/client";
import { dateInput, moneyAmountNonNegative, parseWithSchema } from "@/lib/validation";
import { z } from "zod";
import { logAuditEvent } from "@/lib/audit";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

const accountSchema = z.object({
  startDate: dateInput,
  initialDeposit: moneyAmountNonNegative.optional(),
});

export async function createInstallmentAccount(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("installment");
  if (!hasPermission(tenant, PERMISSIONS.HIREPURCHASE_ACCOUNTS_MANAGE)) {
    redirect("/app/installment/accounts?error=forbidden");
  }
  const scope = await resolveInstallmentAccessScope(tenant);
  if (scope.kind === "denied") {
    redirect("/app/installment/accounts?error=staff-unlinked");
  }

  const customerId = clean(formData.get("customerId"));
  const productId = clean(formData.get("productId"));
  const inventoryStaffId = clean(formData.get("inventoryStaffId"));
  const startDateRaw = clean(formData.get("startDate"));

  if (!customerId || !productId || !startDateRaw) {
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
    await createAccount(tenant.organizationId, scope, { customerId, productId, inventoryStaffId, startDate, initialDeposit });
  } catch (error) {
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
  const tenant = await requireModuleAccess("installment");
  if (!hasPermission(tenant, PERMISSIONS.HIREPURCHASE_ACCOUNTS_MANAGE)) {
    redirect("/app/installment/accounts?error=forbidden");
  }
  const scope = await resolveInstallmentAccessScope(tenant);
  if (scope.kind === "denied") {
    redirect("/app/installment/accounts?error=staff-unlinked");
  }

  const id = clean(formData.get("id"));
  if (!id) return;

  const session = await getServerAuthSession();
  try {
    await updateAccountDeliveryStatus(
      tenant.organizationId,
      scope,
      id,
      session?.user?.name ?? session?.user?.email ?? "unknown",
    );
  } catch (error) {
    if (error instanceof NotFoundError) redirect("/app/installment/accounts?error=not-found");
    throw error;
  }
  revalidatePath("/app/installment/accounts");
  redirect("/app/installment/accounts?saved=1");
}

export async function changeAccountStatus(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("installment");
  if (!hasPermission(tenant, PERMISSIONS.HIREPURCHASE_ACCOUNTS_MANAGE)) {
    redirect("/app/installment/accounts?error=forbidden");
  }
  const scope = await resolveInstallmentAccessScope(tenant);
  if (scope.kind === "denied") {
    redirect("/app/installment/accounts?error=staff-unlinked");
  }

  const id = clean(formData.get("id"));
  const status = clean(formData.get("status")) as HirePurchaseAccountStatus | null;
  if (!id || !status) return;

  try {
    await setAccountStatus(tenant.organizationId, scope, id, status);
  } catch (error) {
    if (error instanceof NotFoundError) redirect("/app/installment/accounts?error=not-found");
    throw error;
  }
  revalidatePath("/app/installment/accounts");
  redirect("/app/installment/accounts?saved=1");
}

export async function reactivateInstallmentAccount(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("installment");
  if (!hasPermission(tenant, PERMISSIONS.HIREPURCHASE_ACCOUNTS_MANAGE)) {
    redirect("/app/installment/accounts?error=forbidden");
  }
  const scope = await resolveInstallmentAccessScope(tenant);
  if (scope.kind === "denied") {
    redirect("/app/installment/accounts?error=staff-unlinked");
  }

  const id = clean(formData.get("id"));
  const confirmPassword = clean(formData.get("confirmPassword"));
  if (!id) return;

  const session = await getServerAuthSession();
  if (!session?.user?.id || !confirmPassword || !(await verifyCurrentPassword(session.user.id, confirmPassword))) {
    redirect("/app/installment/accounts?error=wrong-password");
  }

  try {
    await reactivateAccount(tenant.organizationId, scope, id);
    await logAuditEvent({
      organizationId: tenant.organizationId,
      userId: session?.user?.id,
      module: "installment",
      action: "installment.account.reactivated",
      entityName: "HirePurchaseAccount",
      entityId: id,
    });
  } catch (error) {
    if (error instanceof ReactivationNotEligibleError) {
      redirect("/app/installment/accounts?error=not-eligible");
    }
    if (error instanceof NotFoundError) redirect("/app/installment/accounts?error=not-found");
    throw error;
  }

  revalidatePath("/app/installment/accounts");
  redirect("/app/installment/accounts?saved=1");
}

export async function correctInstallmentAccountPrice(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("installment");
  if (!hasPermission(tenant, PERMISSIONS.HIREPURCHASE_ACCOUNTS_MANAGE)) redirect("/app/installment/accounts?error=forbidden");
  const scope = await resolveInstallmentAccessScope(tenant);
  const id = clean(formData.get("id"));
  const targetAmount = clean(formData.get("targetAmount"));
  const password = clean(formData.get("confirmPassword"));
  const session = await getServerAuthSession();
  if (!id || !targetAmount) redirect("/app/installment/accounts?error=missing-fields");
  if (!session?.user?.id || !password || !(await verifyCurrentPassword(session.user.id, password))) {
    redirect("/app/installment/accounts?error=wrong-password");
  }
  try {
    const change = await updateAccountPrice(tenant.organizationId, scope, id, targetAmount);
    await logAuditEvent({
      organizationId: tenant.organizationId, userId: session.user.id, module: "installment",
      action: "installment.account.price_corrected", entityName: "HirePurchaseAccount", entityId: id, metadata: change,
    });
  } catch (error) {
    if (error instanceof NotFoundError) redirect("/app/installment/accounts?error=not-found");
    if (error instanceof InvalidAccountPriceError) redirect("/app/installment/accounts?error=invalid-price");
    throw error;
  }
  revalidatePath("/app/installment/accounts");
  redirect("/app/installment/accounts?saved=1");
}

export async function correctInstallmentAccountProduct(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("installment");
  if (!hasPermission(tenant, PERMISSIONS.HIREPURCHASE_ACCOUNTS_MANAGE)) redirect("/app/installment/accounts?error=forbidden");
  const scope = await resolveInstallmentAccessScope(tenant);
  const id = clean(formData.get("id"));
  const productId = clean(formData.get("productId"));
  const password = clean(formData.get("confirmPassword"));
  const session = await getServerAuthSession();
  if (!id || !productId) redirect("/app/installment/accounts?error=missing-fields");
  if (!session?.user?.id || !password || !(await verifyCurrentPassword(session.user.id, password))) {
    redirect("/app/installment/accounts?error=wrong-password");
  }
  try {
    const change = await updateAccountProduct(tenant.organizationId, scope, id, productId);
    await logAuditEvent({
      organizationId: tenant.organizationId, userId: session.user.id, module: "installment",
      action: "installment.account.product_corrected", entityName: "HirePurchaseAccount", entityId: id, metadata: change,
    });
  } catch (error) {
    if (error instanceof NotFoundError) redirect("/app/installment/accounts?error=not-found");
    throw error;
  }
  revalidatePath("/app/installment/accounts");
  revalidatePath("/app/installment/payments");
  redirect("/app/installment/accounts?saved=1");
}
