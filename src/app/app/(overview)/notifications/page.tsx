import { Bell } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import { requireCurrentTenant } from "@/lib/tenant";
import { getServerAuthSession } from "@/lib/auth/session";
import { markNotificationRead, markAllNotificationsRead } from "./actions";

export default async function WorkspaceNotificationsPage() {
  const tenant = await requireCurrentTenant();
  const session = await getServerAuthSession();
  const userId = session?.user?.id;

  const notifications = await db.notification.findMany({
    where: {
      organizationId: tenant.organizationId,
      OR: [{ userId }, { userId: null }],
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader title="Notifications" description="Updates from your organization and its active modules." />
        {unreadCount > 0 ? (
          <form action={markAllNotificationsRead}>
            <Button type="submit" variant="outline" size="sm">
              Mark all read
            </Button>
          </form>
        ) : null}
      </div>

      {notifications.length === 0 ? (
        <EmptyState icon={Bell} title="No notifications yet" description="You're all caught up. Notifications from your modules will appear here." />
      ) : (
        <div className="space-y-2">
          {notifications.map((notification) => (
            <div
              key={notification.id}
              className="flex items-start justify-between gap-4 rounded-lg border p-3"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{notification.title}</p>
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
          ))}
        </div>
      )}
    </div>
  );
}
