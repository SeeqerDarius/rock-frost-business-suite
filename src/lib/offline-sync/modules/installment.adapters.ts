import "server-only";

import { z } from "zod";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { resolveInstallmentAccessScope } from "@/modules/installment/access";
import { recordPayment } from "@/modules/installment/service";
import { OfflineMutationDeniedError } from "@/lib/offline-sync/errors";
import { defineOfflineAdapter } from "@/lib/offline-sync/registry";

const optionalText = z.string().trim().max(2000).nullable().optional();

const installmentPaymentSchema = z.object({
  accountId: z.string().min(1).max(64),
  amount: z.string().regex(/^\d{1,12}(\.\d{1,2})?$/),
  paymentDate: z.coerce.date(),
  method: z.string().trim().min(1).max(50),
  notes: optionalText,
});

export const installmentOfflineAdapters = [
  defineOfflineAdapter({
    entityType: "installment.payment",
    operation: "CREATE",
    payloadSchema: installmentPaymentSchema,
    checkPermission: (tenant) => hasPermission(tenant, PERMISSIONS.HIREPURCHASE_PAYMENTS_MANAGE),
    apply: async (tenant, _entityId, payload) => {
      const scope = await resolveInstallmentAccessScope(tenant);
      if (scope.kind === "denied") throw new OfflineMutationDeniedError("The staff payment scope is unavailable.");
      const record = await recordPayment(tenant.organizationId, scope, { ...payload, receivedBy: tenant.userId });
      return { id: record.id, receiptNo: record.receiptNo };
    },
  }),
];
