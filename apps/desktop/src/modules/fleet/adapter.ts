import type { LocalDatabase } from "@/db/local-database";
import { recordOfflineMutation } from "@/modules/offline-mutation-recorder";
import { FLEET_ENTITY_TYPES, type FleetDriverPaymentPayload, type FleetInspectionPayload, type FleetMaintenanceReportPayload, type FleetTripPayload } from "@/modules/fleet/types";

export interface FleetAdapterContext {
  db: LocalDatabase;
  organizationId: string;
  actingUserName: string | null;
}

/**
 * Example, working implementation of an offline Fleet adapter. Each method
 * is a thin, typed call into recordOfflineMutation — the pattern every
 * other module adapter in this pass follows too.
 */
export function createFleetAdapter(ctx: FleetAdapterContext) {
  return {
    async recordMaintenanceReport(entityId: string, payload: FleetMaintenanceReportPayload): Promise<void> {
      await recordOfflineMutation({
        db: ctx.db,
        organizationId: ctx.organizationId,
        moduleKey: "fleet",
        entityType: FLEET_ENTITY_TYPES.MAINTENANCE_REPORT,
        entityId,
        operation: "create",
        baseVersion: null,
        payload,
        actingUserName: ctx.actingUserName,
      });
    },

    async recordInspection(entityId: string, payload: FleetInspectionPayload): Promise<void> {
      await recordOfflineMutation({
        db: ctx.db,
        organizationId: ctx.organizationId,
        moduleKey: "fleet",
        entityType: FLEET_ENTITY_TYPES.INSPECTION,
        entityId,
        operation: "create",
        baseVersion: null,
        payload,
        actingUserName: ctx.actingUserName,
      });
    },

    async startTrip(entityId: string, payload: FleetTripPayload): Promise<void> {
      await recordOfflineMutation({
        db: ctx.db,
        organizationId: ctx.organizationId,
        moduleKey: "fleet",
        entityType: FLEET_ENTITY_TYPES.TRIP,
        entityId,
        operation: "create",
        baseVersion: null,
        payload,
        actingUserName: ctx.actingUserName,
      });
    },

    async updateTrip(entityId: string, baseVersion: number, payload: FleetTripPayload): Promise<void> {
      await recordOfflineMutation({
        db: ctx.db,
        organizationId: ctx.organizationId,
        moduleKey: "fleet",
        entityType: FLEET_ENTITY_TYPES.TRIP,
        entityId,
        operation: "update",
        baseVersion,
        payload,
        actingUserName: ctx.actingUserName,
      });
    },

    /** Financial. The caller (shell UI) is responsible for rendering this as "Pending sync" until the mutation queue reports it applied — see db/schema.ts's CachedRecord.hasPendingLocalChange. */
    async recordDriverPayment(entityId: string, payload: FleetDriverPaymentPayload): Promise<void> {
      await recordOfflineMutation({
        db: ctx.db,
        organizationId: ctx.organizationId,
        moduleKey: "fleet",
        entityType: FLEET_ENTITY_TYPES.DRIVER_PAYMENT,
        entityId,
        operation: "create",
        baseVersion: null,
        payload,
        actingUserName: ctx.actingUserName,
      });
    },
  };
}

export type FleetAdapter = ReturnType<typeof createFleetAdapter>;
