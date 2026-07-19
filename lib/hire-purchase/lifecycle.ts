import "server-only";

import { HirePurchaseAccountStatus, HirePurchaseCreditSource, HirePurchaseCreditStatus, HirePurchaseDeliveryStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { getArchiveAfterDeliveryDays, getRefundDeductionRate } from "./settings";

const DORMANT_AFTER_DAYS = 21;
const PROBATION_AFTER_MONTHS = 4;
const CLOSE_AFTER_MONTHS = 6;

function num(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  return Number(value as { toString(): string });
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function addMonths(date: Date, months: number) {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

type LifecycleAccount = {
  id: string;
  status: HirePurchaseAccountStatus;
  startDate: Date;
  balance: unknown;
  totalPaid: unknown;
  targetAmount: unknown;
  payments: { paymentDate: Date }[];
};

function getLastActivityDate(account: Pick<LifecycleAccount, "startDate" | "payments">) {
  return account.payments[0]?.paymentDate ?? account.startDate;
}

export function getDormantReactivationCutoffDate(account: { startDate: Date; payments: { paymentDate: Date }[] }) {
  return addMonths(getLastActivityDate(account), CLOSE_AFTER_MONTHS);
}

export function isDormantReactivationEligible(
  account: { status: HirePurchaseAccountStatus; startDate: Date; payments: { paymentDate: Date }[] },
  now = new Date()
) {
  return (
    (account.status === HirePurchaseAccountStatus.DORMANT ||
      account.status === HirePurchaseAccountStatus.PROBATION ||
      account.status === HirePurchaseAccountStatus.CLOSED) &&
    now >= getDormantReactivationCutoffDate(account)
  );
}

export async function getReactivationAmounts(organizationId: string, totalPaid: number) {
  const rate = await getRefundDeductionRate(organizationId);
  const serviceFee = Math.max(totalPaid, 0) * rate;
  return { serviceFee, nextTotalPaid: Math.max(totalPaid - serviceFee, 0), serviceFeeRate: rate };
}

export async function getClosureRefundAmounts(organizationId: string, totalPaid: number) {
  const rate = await getRefundDeductionRate(organizationId);
  const serviceFee = totalPaid * rate;
  return { refundAmount: Math.max(totalPaid - serviceFee, 0), serviceFee, serviceFeeRate: rate };
}

function getNextLifecycleStatus(account: LifecycleAccount, now: Date): HirePurchaseAccountStatus {
  const terminal: HirePurchaseAccountStatus[] = [
    HirePurchaseAccountStatus.COMPLETED,
    HirePurchaseAccountStatus.CANCELLED,
    HirePurchaseAccountStatus.SUSPENDED,
    HirePurchaseAccountStatus.CLOSED,
    HirePurchaseAccountStatus.ARCHIVED,
  ];
  if (terminal.includes(account.status) || num(account.balance) <= 0) return account.status;

  const lastActivity = getLastActivityDate(account);
  if (now >= addMonths(lastActivity, CLOSE_AFTER_MONTHS)) return HirePurchaseAccountStatus.CLOSED;
  if (now >= addMonths(lastActivity, PROBATION_AFTER_MONTHS)) return HirePurchaseAccountStatus.PROBATION;
  if (now >= addDays(lastActivity, DORMANT_AFTER_DAYS)) return HirePurchaseAccountStatus.DORMANT;
  return HirePurchaseAccountStatus.ACTIVE;
}

/**
 * Recomputes lifecycle statuses (active → dormant → probation → closed) and archives
 * delivered-completed accounts. Called opportunistically from account/dashboard reads
 * rather than via a scheduled job, since this platform has no cron infrastructure yet.
 */
export async function refreshAccountLifecycleStatuses(organizationId: string, now = new Date()) {
  const archiveAfterDays = await getArchiveAfterDeliveryDays(organizationId);
  const archiveCutoff = addDays(now, -archiveAfterDays);

  const deliveredCompleted = await db.hirePurchaseAccount.findMany({
    where: {
      organizationId,
      status: HirePurchaseAccountStatus.COMPLETED,
      deliveryStatus: HirePurchaseDeliveryStatus.DELIVERED,
      deliveredAt: { lte: archiveCutoff },
    },
    select: { id: true },
  });

  if (deliveredCompleted.length > 0) {
    await db.hirePurchaseAccount.updateMany({
      where: { id: { in: deliveredCompleted.map((a) => a.id) } },
      data: { status: HirePurchaseAccountStatus.ARCHIVED },
    });
  }

  const accounts = await db.hirePurchaseAccount.findMany({
    where: {
      organizationId,
      balance: { gt: 0 },
      status: {
        in: [
          HirePurchaseAccountStatus.ACTIVE,
          HirePurchaseAccountStatus.OVERDUE,
          HirePurchaseAccountStatus.DORMANT,
          HirePurchaseAccountStatus.PROBATION,
        ],
      },
    },
    include: {
      payments: { orderBy: { paymentDate: "desc" }, take: 1 },
      credits: { where: { source: HirePurchaseCreditSource.ACCOUNT_CLOSURE_REFUND, status: { not: HirePurchaseCreditStatus.VOID } } },
    },
  });

  for (const account of accounts) {
    const nextStatus = getNextLifecycleStatus(account, now);
    if (nextStatus === account.status) continue;

    if (nextStatus === HirePurchaseAccountStatus.CLOSED && num(account.totalPaid) > 0 && account.credits.length === 0) {
      const { refundAmount, serviceFeeRate } = await getClosureRefundAmounts(organizationId, num(account.totalPaid));
      if (refundAmount > 0) {
        await db.hirePurchaseCredit.create({
          data: {
            organizationId,
            customerId: account.customerId,
            accountId: account.id,
            amount: refundAmount,
            remainingAmount: refundAmount,
            status: HirePurchaseCreditStatus.OPEN,
            source: HirePurchaseCreditSource.ACCOUNT_CLOSURE_REFUND,
            notes: `Account closed after inactivity. Service fee deducted: ${Math.round(serviceFeeRate * 100)}%.`,
          },
        });
      }
    }

    await db.hirePurchaseAccount.update({ where: { id: account.id }, data: { status: nextStatus } });
  }
}
