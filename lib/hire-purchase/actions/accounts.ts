"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { HirePurchaseAccountStatus, HirePurchaseDeliveryStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission, PERMISSIONS } from "@/lib/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import { logAuditEvent } from "@/lib/audit";
import { consumeStaffInventory, restoreStaffInventory, StaffInventoryError } from "../inventory";
import { recordPaymentForAccount } from "./payments-core";
import { getReactivationAmounts, isDormantReactivationEligible } from "../lifecycle";

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function parseLocalDate(value: string): Date | null {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isFutureDate(date: Date, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return target > today;
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export async function createAccount(formData: FormData): Promise<void> {
  const tenant = await requirePermission(PERMISSIONS.HIREPURCHASE_ACCOUNTS_MANAGE);
  const session = await getServerAuthSession();
  const userId = session?.user?.id;

  const customerId = clean(formData.get("customerId"));
  const productId = clean(formData.get("productId"));
  const startDate = parseLocalDate(clean(formData.get("startDate")));
  const firstPaymentAmountValue = clean(formData.get("amount"));
  const firstPaymentAmount = Number(firstPaymentAmountValue);
  const firstPaymentDate = parseLocalDate(clean(formData.get("paymentDate")));
  const firstPaymentMethod = clean(formData.get("method"));
  const firstPaymentNotes = clean(formData.get("notes"));
  const wantsFirstPayment = Boolean(firstPaymentAmountValue || firstPaymentDate);

  if (!customerId || !productId || !startDate) {
    redirect("/hire-purchase/accounts/new?error=missing-required-fields");
  }
  if (isFutureDate(startDate!)) {
    redirect("/hire-purchase/accounts/new?error=start-date-future");
  }
  if (wantsFirstPayment && (!Number.isFinite(firstPaymentAmount) || firstPaymentAmount <= 0)) {
    redirect("/hire-purchase/accounts/new?error=invalid-payment-amount");
  }
  if (wantsFirstPayment && (!firstPaymentDate || isFutureDate(firstPaymentDate))) {
    redirect("/hire-purchase/accounts/new?error=invalid-payment-date");
  }
  if (wantsFirstPayment && !firstPaymentMethod) {
    redirect("/hire-purchase/accounts/new?error=payment-method-required");
  }

  const [customer, product] = await Promise.all([
    db.hirePurchaseCustomer.findFirst({ where: { id: customerId, organizationId: tenant.organizationId } }),
    db.hirePurchaseProduct.findFirst({ where: { id: productId, organizationId: tenant.organizationId } }),
  ]);

  if (!customer) redirect("/hire-purchase/accounts/new?error=customer-not-found");
  if (!product || !product.active) redirect("/hire-purchase/accounts/new?error=product-unavailable");

  const targetAmount = Number(product!.price);
  const dailyAmount = Number(product!.dailyAmount);
  const expectedEndDate = addDays(startDate!, product!.duration);

  let accountId: string;

  try {
    accountId = await db.$transaction(async (tx) => {
      const account = await tx.hirePurchaseAccount.create({
        data: {
          organizationId: tenant.organizationId,
          customerId: customer!.id,
          productId: product!.id,
          inventoryStaffId: customer!.staffId,
          startDate: startDate!,
          expectedEndDate,
          targetAmount,
          dailyAmount,
          totalPaid: 0,
          balance: targetAmount,
          status: HirePurchaseAccountStatus.ACTIVE,
        },
      });

      await consumeStaffInventory({ tx, organizationId: tenant.organizationId, staffId: customer!.staffId, productId: product!.id });

      await tx.auditLog.create({
        data: {
          organizationId: tenant.organizationId,
          userId,
          action: "CREATE_ACCOUNT",
          entityName: "HirePurchaseAccount",
          entityId: account.id,
          changes: { customerId: customer!.id, productId: product!.id },
        },
      });

      if (wantsFirstPayment && firstPaymentDate) {
        await recordPaymentForAccount({
          tx,
          organizationId: tenant.organizationId,
          userId,
          account: { id: account.id, targetAmount, totalPaid: 0, balance: targetAmount, status: account.status },
          amount: firstPaymentAmount,
          paymentDate: firstPaymentDate,
          method: firstPaymentMethod,
          notes: firstPaymentNotes,
        });
      }

      return account.id;
    }, { timeout: 15000 });
  } catch (error) {
    if (error instanceof StaffInventoryError) {
      redirect(`/hire-purchase/accounts/new?error=${encodeURIComponent(error.message)}`);
    }
    redirect("/hire-purchase/accounts/new?error=create-failed");
  }

  revalidatePath("/hire-purchase/accounts");
  revalidatePath("/hire-purchase/customers");
  revalidatePath("/hire-purchase/products");
  redirect(`/hire-purchase/accounts/${accountId}`);
}

export async function updateAccountDeliveryStatus(formData: FormData): Promise<void> {
  const tenant = await requirePermission(PERMISSIONS.HIREPURCHASE_ACCOUNTS_MANAGE);
  const session = await getServerAuthSession();
  const userId = session?.user?.id;

  const id = clean(formData.get("id"));
  const nextStatusValue = clean(formData.get("deliveryStatus"));
  const nextStatus = nextStatusValue === "DELIVERED" ? HirePurchaseDeliveryStatus.DELIVERED : HirePurchaseDeliveryStatus.PENDING;

  const account = await db.hirePurchaseAccount.findFirst({ where: { id, organizationId: tenant.organizationId } });
  if (!account) redirect("/hire-purchase/accounts?error=account-not-found");
  if (account!.status !== HirePurchaseAccountStatus.COMPLETED || Number(account!.balance) > 0) {
    redirect(`/hire-purchase/accounts/${id}?error=delivery-not-completed`);
  }

  await db.hirePurchaseAccount.update({
    where: { id },
    data:
      nextStatus === HirePurchaseDeliveryStatus.DELIVERED
        ? { deliveryStatus: HirePurchaseDeliveryStatus.DELIVERED, deliveredAt: new Date(), deliveredBy: userId }
        : { deliveryStatus: HirePurchaseDeliveryStatus.PENDING, deliveredAt: null, deliveredBy: null },
  });

  await logAuditEvent({
    organizationId: tenant.organizationId,
    userId,
    action: "UPDATE_ACCOUNT_DELIVERY_STATUS",
    entityName: "HirePurchaseAccount",
    entityId: id,
    changes: { nextStatus },
  });

  revalidatePath("/hire-purchase/accounts");
  revalidatePath(`/hire-purchase/accounts/${id}`);
  redirect(`/hire-purchase/accounts/${id}?updated=delivery`);
}

export async function reactivateDormantAccount(formData: FormData): Promise<void> {
  const tenant = await requirePermission(PERMISSIONS.HIREPURCHASE_ACCOUNTS_MANAGE);
  const session = await getServerAuthSession();
  const userId = session?.user?.id;

  const id = clean(formData.get("id"));
  const confirmation = clean(formData.get("confirmation"));
  if (confirmation !== "REACTIVATE") {
    redirect(`/hire-purchase/accounts/${id}?error=confirmation-required`);
  }

  const account = await db.hirePurchaseAccount.findFirst({
    where: { id, organizationId: tenant.organizationId },
    include: { payments: { orderBy: { paymentDate: "desc" }, take: 1 } },
  });
  if (!account) redirect("/hire-purchase/accounts?error=account-not-found");
  if (!isDormantReactivationEligible(account!)) {
    redirect(`/hire-purchase/accounts/${id}?error=reactivation-not-eligible`);
  }

  const { serviceFee, nextTotalPaid, serviceFeeRate } = await getReactivationAmounts(tenant.organizationId, Number(account!.totalPaid));
  const nextBalance = Math.max(Number(account!.targetAmount) - nextTotalPaid, 0);
  const nextStatus = nextBalance <= 0 ? HirePurchaseAccountStatus.COMPLETED : HirePurchaseAccountStatus.ACTIVE;

  await db.$transaction(async (tx) => {
    await tx.hirePurchaseAccount.update({
      where: { id },
      data: { totalPaid: nextTotalPaid, balance: nextBalance, status: nextStatus },
    });

    await tx.hirePurchaseCredit.updateMany({
      where: { accountId: id, source: "ACCOUNT_CLOSURE_REFUND", status: { not: "VOID" } },
      data: { status: "VOID", remainingAmount: 0, resolvedBy: userId, resolvedAt: new Date() },
    });

    await tx.auditLog.create({
      data: {
        organizationId: tenant.organizationId,
        userId,
        action: "REACTIVATE_DORMANT_ACCOUNT",
        entityName: "HirePurchaseAccount",
        entityId: id,
        changes: { serviceFee, serviceFeeRate, nextTotalPaid, nextBalance, nextStatus },
      },
    });
  }, { timeout: 15000 });

  revalidatePath("/hire-purchase/accounts");
  revalidatePath(`/hire-purchase/accounts/${id}`);
  redirect(`/hire-purchase/accounts/${id}?updated=reactivated`);
}

export async function deleteAccount(formData: FormData): Promise<void> {
  const tenant = await requirePermission(PERMISSIONS.HIREPURCHASE_ACCOUNTS_MANAGE);
  const session = await getServerAuthSession();
  const userId = session?.user?.id;

  const id = clean(formData.get("id"));
  const confirmation = clean(formData.get("confirmation"));
  if (confirmation !== "DELETE") {
    redirect(`/hire-purchase/accounts/${id}?error=confirmation-required`);
  }

  const account = await db.hirePurchaseAccount.findFirst({ where: { id, organizationId: tenant.organizationId } });
  if (!account) redirect("/hire-purchase/accounts?error=account-not-found");

  await db.$transaction(async (tx) => {
    await tx.auditLog.create({
      data: {
        organizationId: tenant.organizationId,
        userId,
        action: "DELETE_ACCOUNT",
        entityName: "HirePurchaseAccount",
        entityId: id,
        changes: { deleted: account },
      },
    });

    if (account!.inventoryStaffId) {
      await restoreStaffInventory({ tx, organizationId: tenant.organizationId, staffId: account!.inventoryStaffId, productId: account!.productId });
    }

    await tx.hirePurchasePayment.deleteMany({ where: { accountId: id } });
    await tx.hirePurchaseAccount.delete({ where: { id } });
  }, { timeout: 15000 });

  revalidatePath("/hire-purchase/accounts");
  revalidatePath(`/hire-purchase/customers/${account!.customerId}`);
  redirect("/hire-purchase/accounts?deleted=account");
}
