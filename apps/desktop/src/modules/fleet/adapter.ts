import type { LocalDatabase } from "@/db/local-database";
import { recordOfflineMutation } from "@/modules/offline-mutation-recorder";
import { FLEET_ENTITY_TYPES, type FleetDriverPaymentSubmissionPayload, type FleetMaintenanceRequestPayload } from "@/modules/fleet/types";
export interface FleetAdapterContext { db: LocalDatabase; organizationId: string; actingUserName: string | null }
export function createFleetAdapter(ctx: FleetAdapterContext) {
  const record = (entityId: string, entityType: typeof FLEET_ENTITY_TYPES[keyof typeof FLEET_ENTITY_TYPES], payload: Record<string, unknown>) => recordOfflineMutation({ db: ctx.db, organizationId: ctx.organizationId, moduleKey: "fleet", entityType, entityId, operation: "CREATE", baseVersion: 0, payload, actingUserName: ctx.actingUserName });
  return {
    recordMaintenanceRequest: (entityId: string, payload: FleetMaintenanceRequestPayload) => record(entityId, FLEET_ENTITY_TYPES.MAINTENANCE_REQUEST, payload),
    recordDriverPaymentSubmission: (entityId: string, payload: FleetDriverPaymentSubmissionPayload) => record(entityId, FLEET_ENTITY_TYPES.DRIVER_PAYMENT_SUBMISSION, payload),
  };
}
export type FleetAdapter = ReturnType<typeof createFleetAdapter>;
