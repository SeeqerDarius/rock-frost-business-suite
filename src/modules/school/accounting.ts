import "server-only";

import { db } from "@/lib/db";
import { postModuleRevenue, type PostModuleRevenueResult } from "@/lib/accounting-integration";
import { Prisma } from "@prisma/client";

type SchoolFeePaymentPostingSource = {
  id: string;
  amount: Prisma.Decimal.Value;
  receivedAt: Date;
  receiptNumber: string;
};

export async function postSchoolFeePaymentRevenue(
  organizationId: string,
  payment: SchoolFeePaymentPostingSource,
  actorId?: string | null,
): Promise<PostModuleRevenueResult> {
  const result = await postModuleRevenue(organizationId, {
    sourceModule: "school",
    sourceType: "SCHOOL_FEE_PAYMENT",
    sourceId: payment.id,
    postingPurpose: "COLLECTED",
    amount: new Prisma.Decimal(payment.amount).toString(),
    entryDate: payment.receivedAt,
    description: `School fee payment received: receipt ${payment.receiptNumber}`,
    createdById: actorId,
  });
  const postingStatus = result.posted
    ? "POSTED"
    : result.reason === "accounting-not-enabled"
      ? "NOT_REQUIRED"
      : "FAILED";
  await db.schoolFeePayment.updateMany({
    where: { id: payment.id, organizationId, refundedAt: null },
    data: { postingStatus },
  });
  return result;
}
