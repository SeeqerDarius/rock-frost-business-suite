import "server-only";

import type { Prisma } from "@prisma/client";
import { postModuleRevenue } from "@/lib/accounting-integration";

/**
 * The one place every "a verified Fleet payment was collected" event posts
 * to Accounting from. Before this helper, the same
 * {sourceModule:"fleet", sourceType:"FLEET_PAYMENT", postingPurpose:"COLLECTED"}
 * payload was hand-duplicated across 5 call sites in 3 files (fleet
 * payments' own verification, driver-submission review, Work & Pay
 * deposits/instalments, and the Paystack reconciliation path) - safe only
 * because each caller always passed a freshly-created, never-reused
 * FleetPayment id, not because the shape was structurally shared. Called
 * from the Action layer after the source FleetPayment row has already
 * committed, per this codebase's module-posting convention
 * (postSourceJournalEntry is not composable inside a source module's own
 * db.$transaction - see src/lib/accounting-integration.ts's own doc
 * comment).
 */
export async function postVerifiedFleetPaymentRevenue(
  organizationId: string,
  payment: { id: string; amount: Prisma.Decimal | string; date: Date },
  description: string,
  createdById?: string | null,
) {
  return postModuleRevenue(organizationId, {
    sourceModule: "fleet",
    sourceType: "FLEET_PAYMENT",
    sourceId: payment.id,
    postingPurpose: "COLLECTED",
    amount: payment.amount.toString(),
    entryDate: payment.date,
    description,
    createdById,
  });
}
