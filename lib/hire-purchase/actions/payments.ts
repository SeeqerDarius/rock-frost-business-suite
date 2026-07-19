"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission, PERMISSIONS } from "@/lib/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import { logAuditEvent } from "@/lib/audit";
import { getHirePurchaseSettings } from "../settings";
import { recordPaymentForAccount } from "./payments-core";

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

export async function recordPayment(formData: FormData): Promise<void> {
  const tenant = await requirePermission(PERMISSIONS.HIREPURCHASE_PAYMENTS_MANAGE);
  const session = await getServerAuthSession();
  const userId = session?.user?.id;

  const accountId = clean(formData.get("accountId"));
  const amount = Number(clean(formData.get("amount")));
  const paymentDate = parseLocalDate(clean(formData.get("paymentDate")));
  const method = clean(formData.get("method"));
  const notes = clean(formData.get("notes"));

  if (!accountId) redirect("/hire-purchase/payments/new?error=account-required");
  if (!Number.isFinite(amount) || amount <= 0) redirect(`/hire-purchase/accounts/${accountId}?error=invalid-payment-amount`);
  if (!paymentDate || isFutureDate(paymentDate)) redirect(`/hire-purchase/accounts/${accountId}?error=invalid-payment-date`);
  if (!method) redirect(`/hire-purchase/accounts/${accountId}?error=payment-method-required`);

  const account = await db.hirePurchaseAccount.findFirst({ where: { id: accountId, organizationId: tenant.organizationId } });
  if (!account) redirect("/hire-purchase/payments/new?error=account-not-found");

  if (["CANCELLED", "SUSPENDED", "CLOSED", "ARCHIVED"].includes(account!.status)) {
    redirect(`/hire-purchase/accounts/${accountId}?error=account-not-payable`);
  }
  if (Number(account!.balance) <= 0 || account!.status === "COMPLETED") {
    redirect(`/hire-purchase/accounts/${accountId}?error=account-already-completed`);
  }

  let receiptNo: string;
  try {
    const payment = await db.$transaction((tx) =>
      recordPaymentForAccount({
        tx,
        organizationId: tenant.organizationId,
        userId,
        account: {
          id: account!.id,
          targetAmount: Number(account!.targetAmount),
          totalPaid: Number(account!.totalPaid),
          balance: Number(account!.balance),
          status: account!.status,
        },
        amount,
        paymentDate,
        method,
        notes,
      }),
      { timeout: 15000 }
    );
    receiptNo = payment.receiptNo;
  } catch (error) {
    console.error("RECORD_PAYMENT_ERROR", error);
    redirect(`/hire-purchase/accounts/${accountId}?error=payment-failed`);
  }

  revalidatePath("/hire-purchase/payments");
  revalidatePath("/hire-purchase/accounts");
  revalidatePath(`/hire-purchase/accounts/${accountId}`);
  redirect(`/hire-purchase/accounts/${accountId}?payment=${encodeURIComponent(receiptNo)}`);
}

export async function updatePayment(formData: FormData): Promise<void> {
  const tenant = await requirePermission(PERMISSIONS.HIREPURCHASE_PAYMENTS_MANAGE);
  const session = await getServerAuthSession();
  const userId = session?.user?.id;

  const id = clean(formData.get("id"));
  const amount = Number(clean(formData.get("amount")));
  const paymentDate = parseLocalDate(clean(formData.get("paymentDate")));
  const method = clean(formData.get("method"));
  const notes = clean(formData.get("notes"));

  if (!Number.isFinite(amount) || amount <= 0) redirect(`/hire-purchase/payments?error=invalid-amount`);
  if (!paymentDate || isFutureDate(paymentDate)) redirect(`/hire-purchase/payments?error=invalid-date`);
  if (!method) redirect(`/hire-purchase/payments?error=method-required`);

  const settings = await getHirePurchaseSettings(tenant.organizationId);
  const payment = await db.hirePurchasePayment.findFirst({
    where: { id, organizationId: tenant.organizationId },
    include: { credit: true, account: true },
  });
  if (!payment) redirect("/hire-purchase/payments?error=payment-not-found");

  const elapsedMs = Date.now() - payment!.createdAt.getTime();
  const editWindowMs = settings.paymentEditWindowHours * 60 * 60 * 1000;
  if (elapsedMs < 0 || elapsedMs > editWindowMs) {
    redirect(`/hire-purchase/payments?error=edit-window-expired`);
  }

  const amountChanged = Number(payment!.amount) !== amount;
  if (amountChanged && payment!.credit && (payment!.credit.status !== "OPEN" || Number(payment!.credit.remainingAmount) !== Number(payment!.credit.amount))) {
    redirect(`/hire-purchase/payments?error=credit-already-resolved`);
  }

  await db.$transaction(async (tx) => {
    await tx.hirePurchasePayment.update({ where: { id }, data: { amount, paymentDate, method, notes: notes || null } });

    const otherTotals = await tx.hirePurchasePayment.aggregate({
      where: { accountId: payment!.accountId, id: { not: id } },
      _sum: { amount: true },
    });
    const otherPaid = Number(otherTotals._sum.amount ?? 0);
    const balanceBeforeThisPayment = Math.max(Number(payment!.account.targetAmount) - otherPaid, 0);
    const creditAmount = Math.max(amount - balanceBeforeThisPayment, 0);

    if (amountChanged) {
      if (creditAmount > 0) {
        if (payment!.credit) {
          await tx.hirePurchaseCredit.update({
            where: { id: payment!.credit.id },
            data: { amount: creditAmount, remainingAmount: creditAmount, notes: `Overpayment from receipt ${payment!.receiptNo}` },
          });
        } else {
          await tx.hirePurchaseCredit.create({
            data: {
              organizationId: tenant.organizationId,
              customerId: payment!.account.customerId,
              accountId: payment!.accountId,
              paymentId: id,
              amount: creditAmount,
              remainingAmount: creditAmount,
              source: "PAYMENT_OVERPAYMENT",
              notes: `Overpayment from receipt ${payment!.receiptNo}`,
              createdBy: userId,
            },
          });
        }
      } else if (payment!.credit) {
        await tx.hirePurchaseCredit.delete({ where: { id: payment!.credit.id } });
      }
    }

    const newTotals = await tx.hirePurchasePayment.aggregate({ where: { accountId: payment!.accountId }, _sum: { amount: true } });
    const nextTotalPaid = Number(newTotals._sum.amount ?? 0);
    const nextBalance = Math.max(Number(payment!.account.targetAmount) - nextTotalPaid, 0);
    const nextStatus = nextBalance <= 0 ? "COMPLETED" : payment!.account.status === "COMPLETED" ? "ACTIVE" : payment!.account.status;

    await tx.hirePurchaseAccount.update({
      where: { id: payment!.accountId },
      data: { totalPaid: nextTotalPaid, balance: nextBalance, status: nextStatus },
    });

    await tx.auditLog.create({
      data: {
        organizationId: tenant.organizationId,
        userId,
        action: "UPDATE_PAYMENT",
        entityName: "HirePurchasePayment",
        entityId: id,
        changes: { before: { amount: payment!.amount, method: payment!.method }, after: { amount, method }, nextBalance },
      },
    });
  }, { timeout: 15000 });

  revalidatePath("/hire-purchase/payments");
  revalidatePath(`/hire-purchase/accounts/${payment!.accountId}`);
  redirect(`/hire-purchase/accounts/${payment!.accountId}?updated=payment`);
}

export async function deletePayment(formData: FormData): Promise<void> {
  const tenant = await requirePermission(PERMISSIONS.HIREPURCHASE_PAYMENTS_MANAGE);
  const session = await getServerAuthSession();
  const userId = session?.user?.id;

  const id = clean(formData.get("id"));
  const confirmation = clean(formData.get("confirmation"));
  if (confirmation !== "DELETE") redirect("/hire-purchase/payments?error=confirmation-required");

  const payment = await db.hirePurchasePayment.findFirst({ where: { id, organizationId: tenant.organizationId }, include: { account: true } });
  if (!payment) redirect("/hire-purchase/payments?error=payment-not-found");

  await db.$transaction(async (tx) => {
    await tx.auditLog.create({
      data: {
        organizationId: tenant.organizationId,
        userId,
        action: "DELETE_PAYMENT",
        entityName: "HirePurchasePayment",
        entityId: id,
        changes: { deleted: payment },
      },
    });

    await tx.hirePurchasePayment.delete({ where: { id } });

    const totals = await tx.hirePurchasePayment.aggregate({ where: { accountId: payment!.accountId }, _sum: { amount: true } });
    const nextTotalPaid = Number(totals._sum.amount ?? 0);
    const nextBalance = Math.max(Number(payment!.account.targetAmount) - nextTotalPaid, 0);
    const nextStatus = nextBalance <= 0 ? "COMPLETED" : payment!.account.status === "COMPLETED" ? "ACTIVE" : payment!.account.status;

    await tx.hirePurchaseAccount.update({
      where: { id: payment!.accountId },
      data: { totalPaid: nextTotalPaid, balance: nextBalance, status: nextStatus },
    });
  }, { timeout: 15000 });

  revalidatePath("/hire-purchase/payments");
  revalidatePath(`/hire-purchase/accounts/${payment!.accountId}`);
  redirect("/hire-purchase/payments?deleted=payment");
}
