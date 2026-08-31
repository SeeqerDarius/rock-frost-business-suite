import "server-only";

import type { FleetVehicleExpenseType, Prisma } from "@prisma/client";
import { postModuleRevenue, postModuleExpense, type ModuleExpenseSource } from "@/lib/accounting-integration";

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

const VEHICLE_EXPENSE_SOURCE_MODULE: Record<FleetVehicleExpenseType, ModuleExpenseSource> = {
  FUEL: "fleet-fuel",
  FINE: "fleet-fine",
  INSURANCE_PREMIUM: "fleet-insurance",
  LICENSING: "fleet-licensing",
  OTHER: "fleet-other",
};

/**
 * A recorded FleetVehicleExpense (fuel/fine/insurance/licensing/other) posts
 * once, to the GL account matching its own type - see
 * VEHICLE_EXPENSE_SOURCE_MODULE and MODULE_EXPENSE_ACCOUNTS in
 * src/lib/accounting-integration.ts. Distinct from
 * postVerifiedFleetPaymentRevenue's sourceType ("FLEET_PAYMENT") and from
 * a verified maintenance repair's own posting ("FLEET_MAINTENANCE_REPAIR"),
 * so all three can never collide on the same idempotency tuple.
 */
export async function postFleetVehicleExpense(
  organizationId: string,
  expense: { id: string; type: FleetVehicleExpenseType; amount: Prisma.Decimal | string; date: Date; branchId?: string | null },
  description: string,
  createdById?: string | null,
) {
  return postModuleExpense(organizationId, {
    sourceModule: VEHICLE_EXPENSE_SOURCE_MODULE[expense.type],
    sourceType: "FLEET_VEHICLE_EXPENSE",
    sourceId: expense.id,
    postingPurpose: "RECORDED",
    amount: expense.amount.toString(),
    entryDate: expense.date,
    description,
    createdById,
    branchId: expense.branchId,
  });
}
