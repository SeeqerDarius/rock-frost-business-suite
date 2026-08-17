import type { SchoolFeeInvoiceRecord } from "@/modules/school/types";

/**
 * Mirrors recordSchoolFeePayment's own outstanding-balance calculation
 * server-side (src/modules/school/service.ts): amount minus discount minus
 * every non-refunded payment. Used only for the desktop's own display and
 * form guardrails - the server recomputes and enforces this independently
 * at sync time, so a stale local figure can never cause an overpayment to
 * actually apply.
 */
export function computeFeeInvoiceOutstanding(invoice: SchoolFeeInvoiceRecord): number {
  const paid = invoice.payments.filter((p) => !p.refundedAt).reduce((sum, p) => sum + Number(p.amount), 0);
  return Math.max(0, Number(invoice.amount) - Number(invoice.discount) - paid);
}
