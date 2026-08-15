export interface FleetMaintenanceRequestPayload extends Record<string, unknown> {
  vehicleId: string; faultDescription: string; ownerApprovalRequired?: boolean;
}
export interface FleetDriverPaymentSubmissionPayload extends Record<string, unknown> {
  vehicleId?: string | null; contractId?: string | null; amount: string; paymentDate: string;
  paymentMethod: string; reference?: string | null; notes?: string | null;
}
export const FLEET_ENTITY_TYPES = {
  MAINTENANCE_REQUEST: "fleet.maintenance_request",
  DRIVER_PAYMENT_SUBMISSION: "fleet.driver_payment_submission",
} as const;
