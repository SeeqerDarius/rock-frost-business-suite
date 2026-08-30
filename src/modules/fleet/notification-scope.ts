import "server-only";

export type ScopableNotification = { userId: string | null; metadata: unknown };

/**
 * An org-wide broadcast (userId: null) that carries a vehicleId in its
 * metadata — a document renewal, a completed repair for an unlinked owner,
 * etc. — is only relevant to that vehicle's own owner. A broadcast with no
 * vehicleId (a general announcement) isn't vehicle-specific and stays
 * visible to everyone, same as before this scoping existed.
 */
export function scopeBroadcastsToOwnedVehicles<T extends ScopableNotification>(
  notifications: T[],
  ownedVehicleIds: Set<string>,
): T[] {
  return notifications.filter((notification) => {
    if (notification.userId !== null) return true;
    const metadata = notification.metadata;
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return true;
    const vehicleId = (metadata as Record<string, unknown>).vehicleId;
    if (typeof vehicleId !== "string") return true;
    return ownedVehicleIds.has(vehicleId);
  });
}
