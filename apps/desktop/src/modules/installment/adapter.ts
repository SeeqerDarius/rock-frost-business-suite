import type { LocalDatabase } from "@/db/local-database";
import { recordOfflineMutation } from "@/modules/offline-mutation-recorder";
import { INSTALLMENT_ENTITY_TYPES, type InstallmentPaymentPayload } from "@/modules/installment/types";
export interface InstallmentAdapterContext { db: LocalDatabase; organizationId: string; actingUserName: string | null }
export function createInstallmentAdapter(ctx: InstallmentAdapterContext) {
  return { recordPayment: (entityId: string, payload: InstallmentPaymentPayload) => recordOfflineMutation({ db: ctx.db, organizationId: ctx.organizationId, moduleKey: "installment", entityType: INSTALLMENT_ENTITY_TYPES.PAYMENT, entityId, operation: "CREATE", baseVersion: 0, payload, actingUserName: ctx.actingUserName }) };
}
export type InstallmentAdapter = ReturnType<typeof createInstallmentAdapter>;
