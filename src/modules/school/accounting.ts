import "server-only";

import { db } from "@/lib/db";
import { postModuleRevenue, postModuleRevenueRefund, type PostModuleRevenueResult } from "@/lib/accounting-integration";
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

type SchoolFeeRefundPostingSource = { id: string; amount: Prisma.Decimal.Value; createdAt: Date; reason: string; reference?: string | null };

export async function postSchoolFeeRefundRevenue(organizationId: string, refund: SchoolFeeRefundPostingSource, actorId?: string | null): Promise<PostModuleRevenueResult> {
  const result = await postModuleRevenueRefund(organizationId, {
    sourceModule: "school",
    sourceType: "SCHOOL_FEE_REFUND",
    sourceId: refund.id,
    postingPurpose: "REFUNDED",
    amount: new Prisma.Decimal(refund.amount).toString(),
    entryDate: refund.createdAt,
    description: `School fee refund: ${refund.reason}${refund.reference ? ` (${refund.reference})` : ""}`,
    createdById: actorId,
  });
  const postingStatus = result.posted ? "POSTED" : result.reason === "accounting-not-enabled" ? "NOT_REQUIRED" : "FAILED";
  await db.schoolFeeRefund.updateMany({ where: { id: refund.id, organizationId }, data: { postingStatus } });
  return result;
}
