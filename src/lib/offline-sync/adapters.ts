import "server-only";

import { z } from "zod";
import type { TenantContext } from "@/lib/tenant";
import type { OfflineMutationInput } from "@/lib/offline-sync/contract";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import {
  canUserReportFleetVehicle,
  createFleetMaintenanceRequest,
  submitFleetDriverPayment,
} from "@/modules/fleet/service";
import { resolveInstallmentAccessScope } from "@/modules/installment/access";
import { recordPayment } from "@/modules/installment/service";
import { recordMovement } from "@/modules/inventory/service";
import { createSale } from "@/modules/pos/service";

export class OfflineMutationDeniedError extends Error {}
export class OfflineMutationConflictError extends Error {
  constructor(message: string, public readonly conflictType: string) {
    super(message);
  }
}

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
const installmentPaymentSchema = z.object({
  accountId: z.string().min(1).max(64),
  amount: z.string().regex(/^\d{1,12}(\.\d{1,2})?$/),
  paymentDate: z.coerce.date(),
  method: z.string().trim().min(1).max(50),
  notes: optionalText,
});
const inventoryMovementSchema = z.object({
  itemId: z.string().min(1).max(64),
  warehouseId: z.string().min(1).max(64),
  type: z.enum(["RECEIPT", "ADJUSTMENT"]),
  quantity: z.number().int().refine((value) => value !== 0),
  reference: z.string().trim().max(100).nullable().optional(),
  notes: optionalText,
  occurredAt: z.coerce.date(),
});
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

function requirePermission(tenant: TenantContext, permission: string) {
  if (!hasPermission(tenant, permission)) throw new OfflineMutationDeniedError("Permission is no longer available.");
}

function parsePayload<T>(schema: z.ZodType<T>, payload: Record<string, unknown>): T {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new OfflineMutationConflictError("The offline record is invalid or no longer supported.", "INVALID_PAYLOAD");
  return parsed.data;
}

export async function applyOfflineMutation(tenant: TenantContext, mutation: OfflineMutationInput) {
  try {
    if (mutation.entityType === "fleet.maintenance_request") {
      if (!hasPermission(tenant, PERMISSIONS.FLEET_MAINTENANCE_MANAGE) && !hasPermission(tenant, PERMISSIONS.FLEET_DRIVER_SELF_SERVICE)) {
        throw new OfflineMutationDeniedError("Permission is no longer available.");
      }
      const payload = parsePayload(maintenanceSchema, mutation.payload);
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
    }

    if (mutation.entityType === "fleet.driver_payment_submission") {
      requirePermission(tenant, PERMISSIONS.FLEET_DRIVER_SELF_SERVICE);
      const payload = parsePayload(driverPaymentSchema, mutation.payload);
      const record = await submitFleetDriverPayment(tenant.organizationId, tenant.userId, payload);
      return { id: record.id, status: record.status };
    }

    if (mutation.entityType === "installment.payment") {
      requirePermission(tenant, PERMISSIONS.HIREPURCHASE_PAYMENTS_MANAGE);
      const payload = parsePayload(installmentPaymentSchema, mutation.payload);
      const scope = await resolveInstallmentAccessScope(tenant);
      if (scope.kind === "denied") throw new OfflineMutationDeniedError("The staff payment scope is unavailable.");
      const record = await recordPayment(tenant.organizationId, scope, { ...payload, receivedBy: tenant.userId });
      return { id: record.id, receiptNo: record.receiptNo };
    }

    if (mutation.entityType === "inventory.movement") {
      requirePermission(tenant, PERMISSIONS.INVENTORY_MOVEMENTS_MANAGE);
      const payload = parsePayload(inventoryMovementSchema, mutation.payload);
      const record = await recordMovement(tenant.organizationId, { ...payload, createdById: tenant.userId });
      return { id: record.id, type: record.type };
    }

    if (mutation.entityType === "pos.sale") {
      requirePermission(tenant, PERMISSIONS.POS_SALES_MANAGE);
      const payload = parsePayload(posSaleSchema, mutation.payload);
      const record = await createSale(tenant.organizationId, { ...payload, soldById: tenant.userId });
      return { id: record.id, saleNumber: record.saleNumber };
    }

    throw new OfflineMutationConflictError("This offline operation is not supported.", "UNSUPPORTED_OPERATION");
  } catch (error) {
    if (error instanceof OfflineMutationDeniedError || error instanceof OfflineMutationConflictError) throw error;
    const message = error instanceof Error ? error.message : "The cloud record changed before synchronization.";
    throw new OfflineMutationConflictError(message, "SERVER_STATE_CHANGED");
  }
}
