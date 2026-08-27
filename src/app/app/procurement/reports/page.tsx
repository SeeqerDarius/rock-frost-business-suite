import { Lock } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/currency";
import { getProcurementSummary } from "@/modules/procurement/service";
import { ReportExportLinks } from "@/components/reports/report-export-links";

export default async function ProcurementReportsPage() {
  const tenant = await requireModuleAccess("procurement");

  if (!hasPermission(tenant, PERMISSIONS.PROCUREMENT_REPORTS_VIEW)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Reports" description="Purchase request and order activity summaries." />
        <EmptyState icon={Lock} title="You don't have access to this page" description="Procurement reports are limited to roles with reporting permissions." />
      </div>
    );
  }

  const summary = await getProcurementSummary(tenant.organizationId);

  const stats = [
    { label: "Pending requests", value: summary.pendingRequestCount },
    { label: "Total requests", value: summary.totalRequestCount },
    { label: "Open orders", value: summary.openOrderCount },
    { label: "Open order value", value: formatMoney(summary.openOrderValue, tenant.organization.currency) },
    { label: "Received orders", value: summary.receivedOrderCount },
    { label: "Total orders", value: summary.totalOrderCount },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Purchase request and order activity summaries." actions={<ReportExportLinks moduleKey="procurement" />} />
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
