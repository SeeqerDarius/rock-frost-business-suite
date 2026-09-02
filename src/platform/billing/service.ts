import "server-only";

import { db } from "@/lib/db";

/**
 * Reads the real per-payment ledger (SubscriptionPayment) rather than
 * Subscription itself - src/platform/business-insights/service.ts's
 * getPlatformRevenueOverview() computes MRR/collected/pending from
 * Subscription rows directly and is left untouched; this is a distinct,
 * transaction-level view for invoice/payment history, which no page read
 * before this file existed.
 */
export interface PaymentLedgerRow {
  id: string;
  organizationId: string;
  organizationName: string;
  tenantCode: string;
  status: "SUCCESS" | "FAILED";
  amount: number;
  currency: string;
  invoiceCode: string | null;
  gatewayProvider: string;
  paidAt: Date | null;
  failureReason: string | null;
  createdAt: Date;
}

export async function getPaymentLedger(input: { organizationId?: string; limit?: number } = {}): Promise<PaymentLedgerRow[]> {
  const payments = await db.subscriptionPayment.findMany({
    where: input.organizationId ? { organizationId: input.organizationId } : undefined,
    include: { organization: { select: { name: true, tenantCode: true } } },
    orderBy: { createdAt: "desc" },
    take: Math.min(input.limit ?? 100, 500),
  });

  return payments.map((payment) => ({
    id: payment.id,
    organizationId: payment.organizationId,
    organizationName: payment.organization.name,
    tenantCode: payment.organization.tenantCode,
    status: payment.status,
    amount: Number(payment.amount),
    currency: payment.currency,
    invoiceCode: payment.invoiceCode,
    gatewayProvider: payment.gatewayProvider,
    paidAt: payment.paidAt,
    failureReason: payment.failureReason,
    createdAt: payment.createdAt,
  }));
}

/**
 * Per-currency totals from the same ledger - "collected" is every
 * successful payment ever recorded (not just currently-active
 * subscriptions), "failedAmount"/"failedCount" surface payment attempts
 * that never landed, a risk signal getPlatformRevenueOverview() has no
 * equivalent for since it only sees Subscription's own current status.
 */
export interface PaymentTotals {
  collected: number;
  successCount: number;
  failedAmount: number;
  failedCount: number;
}

export async function getPaymentTotals(): Promise<Record<string, PaymentTotals>> {
  const payments = await db.subscriptionPayment.findMany({ select: { status: true, amount: true, currency: true } });
  const totalsByCurrency: Record<string, PaymentTotals> = {};

  for (const payment of payments) {
    const totals = totalsByCurrency[payment.currency] ?? { collected: 0, successCount: 0, failedAmount: 0, failedCount: 0 };
    const amount = Number(payment.amount);
    if (payment.status === "SUCCESS") {
      totals.collected += amount;
      totals.successCount += 1;
    } else {
      totals.failedAmount += amount;
      totals.failedCount += 1;
    }
    totalsByCurrency[payment.currency] = totals;
  }

  return totalsByCurrency;
}
