"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireCurrentTenant } from "@/lib/tenant";
import { isFleetOwnerRole, isNarrowFleetSelfServiceRole } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import { listFleetActorVehicles } from "@/modules/fleet/service";
import { scopeBroadcastsToOwnedVehicles } from "@/modules/fleet/notification-scope";
import { cuid, parseWithSchema } from "@/lib/validation";

/** Bounds the unread-count scan so the sidebar badge stays cheap even for a very old, never-cleared inbox — the badge itself caps its display at "99+". */
const UNREAD_COUNT_SCAN_LIMIT = 200;

export async function markNotificationRead(formData: FormData): Promise<void> {
  const notificationIdRaw = String(formData.get("notificationId") ?? "").trim();
  const tenant = await requireCurrentTenant();
  if (!notificationIdRaw) return;

  const parsed = parseWithSchema(cuid, notificationIdRaw);
  if (!parsed.success) return;
  const notificationId = parsed.data;

  await db.notification.updateMany({
    where: { id: notificationId, organizationId: tenant.organizationId },
    data: { readAt: new Date() },
  });

  revalidatePath("/app/notifications");
}

export async function markAllNotificationsRead(): Promise<void> {
  const tenant = await requireCurrentTenant();
  const session = await getServerAuthSession();
  const userId = session?.user?.id;

  const candidates = await db.notification.findMany({
    where: {
      organizationId: tenant.organizationId,
      readAt: null,
      // Mirrors the notifications page's own recipient scoping - a Driver
      // or Mechanic's "mark all read" must never silently clear unread
      // state on an org-wide broadcast they never saw in the first place.
      ...(isNarrowFleetSelfServiceRole(tenant) ? { userId } : { OR: [{ userId }, { userId: null }] }),
    },
    select: { id: true, userId: true, metadata: true },
  });

  // Mirror the notifications page's own-vehicle scoping - otherwise an
  // owner's "mark all read" would silently clear unread state on other
  // owners' vehicle broadcasts they never even saw.
  const scoped = isFleetOwnerRole(tenant) && userId
    ? scopeBroadcastsToOwnedVehicles(
        candidates,
        new Set((await listFleetActorVehicles(tenant.organizationId, userId, { driver: false, owner: true })).map((vehicle) => vehicle.id)),
      )
    : candidates;

  if (scoped.length > 0) {
    await db.notification.updateMany({
      where: { id: { in: scoped.map((notification) => notification.id) } },
      data: { readAt: new Date() },
    });
  }

  revalidatePath("/app/notifications");
}

/** Lightweight unread count for the sidebar badge — same recipient/visibility scoping as the notifications page itself, so the badge never advertises an unread item the tenant couldn't actually see there. */
export async function getNotificationUnreadCount(): Promise<number> {
  const tenant = await requireCurrentTenant();
  const session = await getServerAuthSession();
  const userId = session?.user?.id;

  const candidates = await db.notification.findMany({
    where: {
      organizationId: tenant.organizationId,
      readAt: null,
      ...(isNarrowFleetSelfServiceRole(tenant) ? { userId } : { OR: [{ userId }, { userId: null }] }),
    },
    select: { userId: true, metadata: true },
    orderBy: { createdAt: "desc" },
    take: UNREAD_COUNT_SCAN_LIMIT,
  });

  const scoped = isFleetOwnerRole(tenant) && userId
    ? scopeBroadcastsToOwnedVehicles(
        candidates,
        new Set((await listFleetActorVehicles(tenant.organizationId, userId, { driver: false, owner: true })).map((vehicle) => vehicle.id)),
      )
    : candidates;

  return scoped.length;
}
