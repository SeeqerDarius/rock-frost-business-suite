import "server-only";

import { db } from "@/lib/db";
import { postModuleRevenue } from "@/lib/accounting-integration";

/** Keeps the fee ledger as source of truth while making failed GL delivery visible and retryable. */
export async function postSchoolFeePaymentRevenue(
  organizationId: string,
  payment: { id: string; amount: { toString(): string }; receivedAt: Date; receiptNumber: string },
  actorId?: string | null,
) {
  const result = await postModuleRevenue(organizationId, {
    sourceModule: "school",
    sourceType: "SCHOOL_FEE_PAYMENT",
    sourceId: payment.id,
    postingPurpose: "COLLECTED",
    amount: payment.amount.toString(),
    entryDate: payment.receivedAt,
    description: `School fee payment received: receipt ${payment.receiptNumber}`,
    createdById: actorId,
  });

  await db.schoolFeePayment.updateMany({
    where: { id: payment.id, organizationId },
    data: { postingStatus: result.posted ? "POSTED" : result.reason === "accounting-not-enabled" ? "NOT_REQUIRED" : "FAILED" },
  });
  return result;
}
