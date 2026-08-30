import Link from "next/link";
import { Bell } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import { requireCurrentTenant } from "@/lib/tenant";
import { isFleetOwnerRole, isNarrowFleetSelfServiceRole } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import { listFleetActorVehicles } from "@/modules/fleet/service";
import { scopeBroadcastsToOwnedVehicles } from "@/modules/fleet/notification-scope";
import { getNotificationHref } from "@/lib/notifications/deep-link";
import { markNotificationRead, markAllNotificationsRead, getNotificationUnreadCount } from "./actions";

/**
 * "Load more" grows this page size via a `take` query param and re-fetches
 * from the start each time, rather than a database cursor carried across
 * requests. Every render is a deterministic slice of the same
 * (createdAt desc, id desc) order starting at position 0, so repeatedly
 * widening it can never duplicate or skip a row across a page boundary -
 * the exact failure mode a real cursor would need extra care to avoid, here
 * ruled out by construction. It also composes cleanly with the owner's
 * own-vehicle broadcast filter below, which runs after the fetch: widening
 * the raw window can only ever add to the previously-visible scoped items,
 * never reorder or drop them.
 */
const PAGE_SIZE = 25;
const MAX_TAKE = 500;

export default async function WorkspaceNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ unread?: string; take?: string }>;
}) {
  const [tenant, query] = await Promise.all([requireCurrentTenant(), searchParams]);
  const session = await getServerAuthSession();
  const userId = session?.user?.id;

  const unreadOnly = query.unread === "1";
  const requestedTake = Number(query.take);
  const take = Math.min(Math.max(Number.isFinite(requestedTake) ? requestedTake : PAGE_SIZE, PAGE_SIZE), MAX_TAKE);

  const [rawNotifications, unreadCount] = await Promise.all([
    db.notification.findMany({
      where: {
        organizationId: tenant.organizationId,
        ...(unreadOnly ? { readAt: null } : {}),
        // A Driver or Mechanic only ever sees notifications addressed to
        // them - payment and maintenance updates on their own submissions
        // or assignments - never an org-wide broadcast (a document-renewal
        // reminder, for example) that isn't theirs to act on. Every other
        // role keeps seeing both.
        ...(isNarrowFleetSelfServiceRole(tenant) ? { userId } : { OR: [{ userId }, { userId: null }] }),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: take + 1,
    }),
    getNotificationUnreadCount(),
  ]);

  const hasMore = rawNotifications.length > take;
  const windowed = rawNotifications.slice(0, take);

  // A Vehicle Owner only sees broadcasts tied to one of their own vehicles -
  // an org-wide renewal reminder for another owner's vehicle isn't theirs to
  // act on either, even though it isn't addressed to a specific user.
  const isOwner = isFleetOwnerRole(tenant);
  const notifications = isOwner && userId
    ? scopeBroadcastsToOwnedVehicles(
        windowed,
        new Set((await listFleetActorVehicles(tenant.organizationId, userId, { driver: false, owner: true })).map((vehicle) => vehicle.id)),
      )
    : windowed;

  const loadMoreHref = `?${unreadOnly ? "unread=1&" : ""}take=${take + PAGE_SIZE}`;
  const toggleUnreadHref = unreadOnly ? "?" : "?unread=1";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader title="Notifications" description="Updates from your organization and its active modules." />
        <div className="flex items-center gap-2">
          <Button size="sm" variant={unreadOnly ? "default" : "outline"} nativeButton={false} render={<Link href={toggleUnreadHref} />}>
            {unreadOnly ? "Showing unread only" : "Unread only"}
          </Button>
          {unreadCount > 0 ? (
            <form action={markAllNotificationsRead}>
              <Button type="submit" variant="outline" size="sm">
                Mark all read
              </Button>
            </form>
          ) : null}
        </div>
      </div>

      {notifications.length === 0 ? (
        <EmptyState
          icon={Bell}
          title={unreadOnly ? "No unread notifications" : "No notifications yet"}
          description={unreadOnly ? "You're all caught up on unread items." : "You're all caught up. Notifications from your modules will appear here."}
        />
      ) : (
        <div className="space-y-2">
          {notifications.map((notification) => {
            const href = getNotificationHref(notification, isOwner);
            return (
              <div
                key={notification.id}
                className="flex items-start justify-between gap-4 rounded-lg border p-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    {href ? (
                      <Link href={href as never} className="text-sm font-medium hover:underline">
                        {notification.title}
                      </Link>
                    ) : (
                      <p className="text-sm font-medium">{notification.title}</p>
                    )}
                    {!notification.readAt ? <Badge className="text-[10px]">New</Badge> : null}
                  </div>
                  <p className="text-sm text-muted-foreground">{notification.message}</p>
                  <p className="text-xs text-muted-foreground">{notification.createdAt.toLocaleString()}</p>
                </div>
                {!notification.readAt ? (
                  <form action={markNotificationRead}>
                    <input type="hidden" name="notificationId" value={notification.id} />
                    <Button type="submit" variant="ghost" size="sm">
                      Mark read
                    </Button>
                  </form>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {hasMore ? (
        <div className="flex justify-center pt-2">
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href={loadMoreHref} />}>
            Load more
          </Button>
        </div>
      ) : null}
    </div>
  );
}
