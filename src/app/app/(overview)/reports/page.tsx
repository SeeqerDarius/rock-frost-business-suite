import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Button } from "@/components/ui/button";
import { requireCurrentTenant } from "@/lib/tenant";
import { canAccessModule } from "@/lib/auth/permissions";

export default async function WorkspaceReportsPage() {
  const tenant = await requireCurrentTenant();
  const hasAnalytics = canAccessModule(tenant, "analytics");

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Cross-module reporting for your organization." />
      <EmptyState
        icon={BarChart3}
        title="Cross-module reporting lives in the Analytics module"
        description={
          hasAnalytics
            ? "Analytics aggregates data across every module your organization has enabled: financial, sales, operations, and people, all in one place."
            : "Your organization hasn't enabled the Analytics module yet, or your role doesn't include Analytics access. Ask an administrator to enable it from Platform → Organizations."
        }
        action={
          hasAnalytics ? (
            <Button size="sm" nativeButton={false} render={<Link href="/app/analytics" />}>
              Open Analytics
            </Button>
          ) : undefined
        }
      />
    </div>
  );
}
