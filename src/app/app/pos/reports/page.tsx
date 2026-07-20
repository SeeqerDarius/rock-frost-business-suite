import { Lock } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getPosSummary } from "@/modules/pos/service";

export default async function PosReportsPage() {
  const tenant = await requireCurrentTenant();

  if (!hasPermission(tenant, PERMISSIONS.POS_REPORTS_VIEW)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Reports" description="Sales activity summaries." />
        <EmptyState icon={Lock} title="You don't have access to this page" description="POS reports are limited to roles with reporting permissions." />
      </div>
    );
  }

  const summary = await getPosSummary(tenant.organizationId);

  const stats = [
    { label: "Registers", value: summary.registerCount },
    { label: "Open sessions", value: summary.openSessionCount },
    { label: "Today's sales", value: summary.todaysSalesCount },
    { label: "Today's sales total", value: summary.todaysSalesTotal.toFixed(2) },
    { label: "All-time sales", value: summary.allTimeSalesCount },
    { label: "All-time sales total", value: summary.allTimeSalesTotal.toFixed(2) },
    { label: "Refunded sales", value: summary.refundedCount },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Sales activity summaries." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <CardTitle className="text-2xl">{stat.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}
