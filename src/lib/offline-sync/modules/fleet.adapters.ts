import "server-only";

import { z } from "zod";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { canUserReportFleetVehicle, createFleetMaintenanceRequest, submitFleetDriverPayment } from "@/modules/fleet/service";
import { OfflineMutationDeniedError } from "@/lib/offline-sync/errors";
import { defineOfflineAdapter } from "@/lib/offline-sync/registry";

const optionalText = z.string().trim().max(2000).nullable().optional();

const maintenanceSchema = z.object({
  vehicleId: z.string().min(1).max(64),
  faultDescription: z.string().trim().min(3).max(5000),
  ownerApprovalRequired: z.boolean().optional(),
});

const driverPaymentSchema = z.object({
  vehicleId: z.string().max(64).nullable().optional(),
  contractId: z.string().max(64).nullable().optional(),
  amount: z.string().regex(/^\d{1,12}(\.\d{1,2})?$/),
  paymentDate: z.coerce.date(),
  paymentMethod: z.string().trim().min(1).max(50),
  reference: z.string().trim().max(100).nullable().optional(),
  notes: optionalText,
});

export const fleetOfflineAdapters = [
  defineOfflineAdapter({
    entityType: "fleet.maintenance_request",
    operation: "CREATE",
    payloadSchema: maintenanceSchema,
    checkPermission: (tenant) =>
      hasPermission(tenant, PERMISSIONS.FLEET_MAINTENANCE_MANAGE) || hasPermission(tenant, PERMISSIONS.FLEET_DRIVER_SELF_SERVICE),
    apply: async (tenant, _entityId, payload) => {
      if (hasPermission(tenant, PERMISSIONS.FLEET_DRIVER_SELF_SERVICE) && !hasPermission(tenant, PERMISSIONS.FLEET_MAINTENANCE_MANAGE)) {
        const allowed = await canUserReportFleetVehicle(tenant.organizationId, payload.vehicleId, tenant.userId);
        if (!allowed) throw new OfflineMutationDeniedError("This vehicle is no longer assigned to the driver.");
      }
      const record = await createFleetMaintenanceRequest(tenant.organizationId, {
        ...payload,
        requestedById: tenant.userId,
        branchId: tenant.branch?.id,
      });
      return { id: record.id, status: record.progressStatus };
    },
  }),
  defineOfflineAdapter({
    entityType: "fleet.driver_payment_submission",
    operation: "CREATE",
    payloadSchema: driverPaymentSchema,
    checkPermission: (tenant) => hasPermission(tenant, PERMISSIONS.FLEET_DRIVER_SELF_SERVICE),
    apply: async (tenant, _entityId, payload) => {
      const record = await submitFleetDriverPayment(tenant.organizationId, tenant.userId, payload);
      return { id: record.id, status: record.status };
    },
  }),
];
