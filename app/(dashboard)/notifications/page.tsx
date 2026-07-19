import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { getNotificationsForUser } from "@/lib/notifications";
import { requireCurrentTenant } from "@/lib/tenant";
import { getServerAuthSession } from "@/lib/auth/session";
import { MarkNotificationReadButton } from "./MarkNotificationReadButton";

export default async function NotificationsPage() {
  const tenant = await requireCurrentTenant();
  const session = await getServerAuthSession();
  const userId = session!.user.id;
  const notifications = await getNotificationsForUser(tenant.organizationId, userId);

  return (
    <DashboardShell title="Notifications" subtitle="Recent alerts and activity for your account.">
      <div className="space-y-4">
        {notifications.length === 0 ? (
          <div className="glass-card rounded-3xl border border-white/10 p-8 text-center text-slate-400">
            No notifications yet.
          </div>
        ) : (
          notifications.map((notification) => (
            <div
              key={notification.id}
              className={`glass-card rounded-3xl border p-6 shadow-sm shadow-blue-500/10 ${
                notification.readAt ? "border-white/10" : "border-cyan-400/40"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-cyan-200/70">{notification.type}</p>
                  <h3 className="mt-2 text-lg font-semibold text-white">{notification.title}</h3>
                  <p className="mt-2 text-sm text-slate-300">{notification.message}</p>
                  <p className="mt-3 text-xs text-slate-500">
                    {notification.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                  </p>
                </div>
                {!notification.readAt ? <MarkNotificationReadButton id={notification.id} /> : null}
              </div>
            </div>
          ))
        )}
      </div>
    </DashboardShell>
  );
}
