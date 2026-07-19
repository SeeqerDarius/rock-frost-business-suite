import { BarChart3 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";

export default function WorkspaceReportsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Cross-module reporting for your organization." />
      <EmptyState
        icon={BarChart3}
        title="Cross-module reporting is not built yet"
        description="Organization-wide analytics will appear here once at least one module is active and generating data."
      />
    </div>
  );
}
