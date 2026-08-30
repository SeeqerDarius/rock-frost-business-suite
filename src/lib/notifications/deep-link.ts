export type NotificationLinkContext = { type: string; metadata: unknown };

function readVehicleId(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>).vehicleId;
  return typeof value === "string" ? value : null;
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
    case "SUBSCRIPTION_ACTIVATED":
    case "SUBSCRIPTION_RENEWAL_FAILED":
    case "TRIAL_EXPIRED":
      return "/app/organization/billing";
    default:
      return null;
  }
}
