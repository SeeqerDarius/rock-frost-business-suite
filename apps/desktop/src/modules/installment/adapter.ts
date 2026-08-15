import type { LocalDatabase } from "@/db/local-database";
import { recordOfflineMutation } from "@/modules/offline-mutation-recorder";
import { INSTALLMENT_ENTITY_TYPES, type InstallmentCollectionEntryPayload, type InstallmentPaymentReceiptPayload } from "@/modules/installment/types";

export interface InstallmentAdapterContext {
  db: LocalDatabase;
  organizationId: string;
  actingUserName: string | null;
}

/** Both entity types here are financial — the shell must always render them "Pending sync" until the queue confirms them applied, and neither may ever be resolved with an implicit last-write-wins (see conflict/conflict-policy.ts). */
export function createInstallmentAdapter(ctx: InstallmentAdapterContext) {
  return {
    async recordCollectionEntry(entityId: string, payload: InstallmentCollectionEntryPayload): Promise<void> {
      await recordOfflineMutation({
        db: ctx.db,
        organizationId: ctx.organizationId,
        moduleKey: "installment",
        entityType: INSTALLMENT_ENTITY_TYPES.COLLECTION_ENTRY,
        entityId,
        operation: "create",
        baseVersion: null,
        payload,
        actingUserName: ctx.actingUserName,
      });
    },

    async recordPaymentReceipt(entityId: string, payload: InstallmentPaymentReceiptPayload): Promise<void> {
      await recordOfflineMutation({
        db: ctx.db,
        organizationId: ctx.organizationId,
        moduleKey: "installment",
        entityType: INSTALLMENT_ENTITY_TYPES.PAYMENT_RECEIPT,
        entityId,
        operation: "create",
        baseVersion: null,
        payload,
        actingUserName: ctx.actingUserName,
      });
    },
  };
}

export type InstallmentAdapter = ReturnType<typeof createInstallmentAdapter>;
