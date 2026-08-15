/**
 * Client-side draft payload shapes for Fleet's four offline entity types.
 * These are this desktop client's best-effort field lists for what an
 * offline-capable Fleet record needs — they are NOT copied from a
 * confirmed server schema (Codex owns that). Field names here must be
 * reconciled against the real server contract for these entityTypes
 * before this is relied on for a production sync — see
 * apps/desktop/CLAUDE_HANDOFF.md's open questions.
 */

export interface FleetMaintenanceReportPayload {
  vehicleId: string;
  reportedAt: string;
  description: string;
  odometerReading: number | null;
  reportedByName: string;
}

export interface FleetInspectionPayload {
  vehicleId: string;
  inspectedAt: string;
  checklist: { label: string; passed: boolean; notes: string | null }[];
  overallResult: "pass" | "fail" | "needs_attention";
}

export interface FleetTripPayload {
  vehicleId: string;
  driverId: string;
  startedAt: string;
  endedAt: string | null;
  startOdometer: number;
  endOdometer: number | null;
  purpose: string | null;
}

/** Financial — never resolved with an implicit last-write-wins; see conflict/conflict-policy.ts. */
export interface FleetDriverPaymentPayload {
  driverId: string;
  amount: string;
  currency: string;
  paidAt: string;
  method: "cash" | "mobile_money" | "bank_transfer";
  reference: string | null;
}

export const FLEET_ENTITY_TYPES = {
  MAINTENANCE_REPORT: "fleet.maintenance_report",
  INSPECTION: "fleet.inspection",
  TRIP: "fleet.trip",
  DRIVER_PAYMENT: "fleet.driver_payment",
} as const;
