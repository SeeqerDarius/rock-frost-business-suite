import { Activity } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";

export default function PlatformDashboardPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Platform overview" description="Organizations, subscriptions, and module activation across the whole platform." />
      <EmptyState
        icon={Activity}
        title="Platform metrics are not wired up yet"
        description="Organization counts, active subscriptions, module adoption, and platform user activity will appear here once the platform data layer is implemented."
      />
    </div>
  );
}
