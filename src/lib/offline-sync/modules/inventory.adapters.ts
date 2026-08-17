import "server-only";

import { z } from "zod";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { recordMovement } from "@/modules/inventory/service";
import { defineOfflineAdapter } from "@/lib/offline-sync/registry";

const optionalText = z.string().trim().max(2000).nullable().optional();

const inventoryMovementSchema = z.object({
  itemId: z.string().min(1).max(64),
  warehouseId: z.string().min(1).max(64),
  type: z.enum(["RECEIPT", "ADJUSTMENT"]),
  quantity: z.number().int().refine((value) => value !== 0),
  reference: z.string().trim().max(100).nullable().optional(),
  notes: optionalText,
  occurredAt: z.coerce.date(),
});

export const inventoryOfflineAdapters = [
  defineOfflineAdapter({
    entityType: "inventory.movement",
    operation: "CREATE",
    payloadSchema: inventoryMovementSchema,
    checkPermission: (tenant) => hasPermission(tenant, PERMISSIONS.INVENTORY_MOVEMENTS_MANAGE),
    apply: async (tenant, _entityId, payload) => {
      const record = await recordMovement(tenant.organizationId, { ...payload, createdById: tenant.userId });
      return { id: record.id, type: record.type };
    },
  }),
];
