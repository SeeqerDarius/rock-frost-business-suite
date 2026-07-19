import "server-only";

import type { Prisma, HirePurchaseAccountStatus } from "@prisma/client";
import { generateReceiptNo } from "../ids";

type PaymentAccount = {
  id: string;
  targetAmount: number;
  totalPaid: number;
  balance: number;
  status: HirePurchaseAccountStatus;
};

/** Shared transactional core for recording a payment — used by both createAccount's optional first payment and the standalone recordPayment action. */
export async function recordPaymentForAccount({
  tx,
  organizationId,
  userId,
  account,
  amount,
  paymentDate,
  method,
  notes,
}: {
  tx: Prisma.TransactionClient;
  organizationId: string;
  userId?: string | null;
  account: PaymentAccount;
  amount: number;
  paymentDate: Date;
  method: string;
  notes?: string | null;
}) {
  const receiptNo = await generateReceiptNo(organizationId, tx);
  const nextTotalPaid = account.totalPaid + amount;
  const rawBalance = account.balance - amount;
  const creditAmount = rawBalance < 0 ? Math.abs(rawBalance) : 0;
  const nextBalance = rawBalance <= 0 ? 0 : rawBalance;
  const nextStatus: HirePurchaseAccountStatus =
    rawBalance <= 0
      ? "COMPLETED"
      : account.status === "DORMANT" || account.status === "PROBATION"
        ? "ACTIVE"
        : account.status;

  const payment = await tx.hirePurchasePayment.create({
    data: {
      organizationId,
      receiptNo,
      accountId: account.id,
      amount,
      paymentDate,
      method,
      notes: notes || null,
      receivedBy: userId ?? undefined,
    },
  });

  await tx.hirePurchaseAccount.update({
    where: { id: account.id },
    data: { totalPaid: nextTotalPaid, balance: nextBalance, status: nextStatus },
  });

  if (creditAmount > 0) {
    const customer = await tx.hirePurchaseAccount.findUniqueOrThrow({ where: { id: account.id }, select: { customerId: true } });
    await tx.hirePurchaseCredit.create({
      data: {
        organizationId,
        customerId: customer.customerId,
        accountId: account.id,
        paymentId: payment.id,
        amount: creditAmount,
        remainingAmount: creditAmount,
        source: "PAYMENT_OVERPAYMENT",
        notes: `Overpayment from receipt ${receiptNo}`,
        createdBy: userId ?? undefined,
      },
    });
  }

  await tx.auditLog.create({
    data: {
      organizationId,
      userId: userId ?? undefined,
      action: "RECORD_PAYMENT",
      entityName: "HirePurchasePayment",
      entityId: payment.id,
      changes: { receiptNo, amount, previousBalance: account.balance, newBalance: nextBalance, creditAmount },
    },
  });

  return payment;
}
