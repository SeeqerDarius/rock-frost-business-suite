export type NotificationLinkContext = { type: string; metadata: unknown };

function readVehicleId(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>).vehicleId;
  return typeof value === "string" ? value : null;
}

/** A contract notification opens its contract on the relevant tab; access is re-checked by the page. */
function contractHref(metadata: unknown, tab: string): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const contractId = (metadata as Record<string, unknown>).contractId;
  return typeof contractId === "string" && /^[a-z0-9]{8,40}$/i.test(contractId) ? `/app/contracts/${contractId}?tab=${tab}` : "/app/contracts";
}

/**
 * Maps a notification's type — plus whatever id metadata it already carries —
 * to the page that actually shows it. A Vehicle Owner has a real per-vehicle
 * page at /app/fleet/investor/vehicles/[vehicleId]; every other role reading
 * the same event has no equivalent per-row page today, so those land on the
 * flat management list instead of a broken or invented URL. Returns null for
 * a type with no known destination — the title then renders as plain text.
 */
export function getNotificationHref(notification: NotificationLinkContext, isFleetOwner: boolean): string | null {
  const vehicleId = readVehicleId(notification.metadata);
  switch (notification.type) {
    case "FLEET_DOCUMENT_RENEWAL":
      return isFleetOwner && vehicleId ? `/app/fleet/investor/vehicles/${vehicleId}` : "/app/fleet/insurance-roadworthy";
    case "FLEET_MAINTENANCE_SUBMITTED":
    case "FLEET_MAINTENANCE_APPROVED":
    case "FLEET_MAINTENANCE_REJECTED":
    case "FLEET_MAINTENANCE_COMPLETED":
      return isFleetOwner && vehicleId ? `/app/fleet/investor/vehicles/${vehicleId}` : "/app/fleet/maintenance";
    case "FLEET_DRIVER_PAYMENT_SUBMITTED":
    case "FLEET_DRIVER_PAYMENT_APPROVED":
    case "FLEET_DRIVER_PAYMENT_REJECTED":
      return "/app/fleet/driver-portal";
    case "MODULE_REQUEST_UPDATE":
      return "/app/module-requests";
    case "CONTRACT_APPROVAL_REQUESTED":
      return "/app/contracts/approvals";
    case "CONTRACT_APPROVED":
    case "CONTRACT_REJECTED":
    case "CONTRACT_CHANGES_REQUESTED":
      return contractHref(notification.metadata, "approvals");
    case "CONTRACT_OBLIGATION_REMINDER":
    case "CONTRACT_MILESTONE_REMINDER":
      return contractHref(notification.metadata, "obligations");
    case "CONTRACT_ACKNOWLEDGEMENT_REQUESTED":
    case "CONTRACT_ACKNOWLEDGED":
    case "CONTRACT_ACKNOWLEDGEMENT_DECLINED":
      return contractHref(notification.metadata, "signatures");
    case "CONTRACT_EXPIRY_REMINDER":
    case "CONTRACT_NOTICE_DEADLINE":
    case "CONTRACT_TERMINATED":
      return contractHref(notification.metadata, "overview");
    case "SUBSCRIPTION_ACTIVATED":
    case "SUBSCRIPTION_RENEWAL_FAILED":
    case "TRIAL_EXPIRED":
      return "/app/organization/billing";
    default:
      return null;
  }
}
