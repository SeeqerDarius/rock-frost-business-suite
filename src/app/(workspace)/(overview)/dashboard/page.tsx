import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Button } from "@/components/ui/button";

export default function OrganizationDashboardPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description="A summary of the modules enabled for your organization."
      />
      <EmptyState
        icon={LayoutGrid}
        title="No modules activated yet"
        description="Once your organization activates a module, its summary will appear here. Browse the module launcher to get started."
        action={
          <Button size="sm" nativeButton={false} render={<Link href="/modules" />}>
            Browse modules
          </Button>
        }
      />
    </div>
  );
}
