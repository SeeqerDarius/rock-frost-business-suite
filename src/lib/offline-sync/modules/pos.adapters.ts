import "server-only";

import { z } from "zod";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { createSale } from "@/modules/pos/service";
import { defineOfflineAdapter } from "@/lib/offline-sync/registry";

const posSaleSchema = z.object({
  sessionId: z.string().min(1).max(64),
  customerName: z.string().trim().max(200).nullable().optional(),
  paymentMethod: z.enum(["CASH", "CARD", "MOBILE_MONEY", "OTHER"]),
  lines: z.array(z.object({
    itemId: z.string().max(64).nullable().optional(),
    description: z.string().trim().min(1).max(500),
    quantity: z.number().int().positive(),
    unitPrice: z.string().regex(/^\d{1,12}(\.\d{1,2})?$/),
  })).min(1).max(100),
});

export const posOfflineAdapters = [
  defineOfflineAdapter({
    entityType: "pos.sale",
    operation: "CREATE",
    payloadSchema: posSaleSchema,
    checkPermission: (tenant) => hasPermission(tenant, PERMISSIONS.POS_SALES_MANAGE),
    apply: async (tenant, _entityId, payload) => {
      const record = await createSale(tenant.organizationId, { ...payload, soldById: tenant.userId });
      return { id: record.id, saleNumber: record.saleNumber };
    },
  }),
];
