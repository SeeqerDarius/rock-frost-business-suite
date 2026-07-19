import { Bell } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";

export default function WorkspaceNotificationsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Notifications" description="Updates from your organization and its active modules." />
      <EmptyState icon={Bell} title="No notifications yet" description="You're all caught up. Notifications from your modules will appear here." />
    </div>
  );
}
