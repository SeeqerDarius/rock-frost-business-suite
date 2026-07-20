import { Lock, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getCrmSummary } from "@/modules/crm/service";

const STAGE_LABELS: Record<string, string> = {
  NEW: "New",
  QUALIFIED: "Qualified",
  PROPOSAL: "Proposal",
  NEGOTIATION: "Negotiation",
};

export default async function CrmReportsPage() {
  const tenant = await requireCurrentTenant();

  if (!hasPermission(tenant, PERMISSIONS.CRM_REPORTS_VIEW)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Reports" description="Pipeline value, conversion, and activity summaries." />
        <EmptyState icon={Lock} title="You don't have access to this page" description="CRM reports are limited to roles with reporting permissions." />
      </div>
    );
  }

  const summary = await getCrmSummary(tenant.organizationId);

  const stats = [
    { label: "Open pipeline value", value: summary.pipelineValue.toFixed(2) },
    { label: "Won value (all time)", value: summary.wonValue.toFixed(2) },
    { label: "Win rate", value: `${summary.winRate.toFixed(0)}%` },
    { label: "Won this month", value: `${summary.wonThisMonthCount} (${summary.wonThisMonthValue.toFixed(2)})` },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Pipeline value, conversion, and activity summaries." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader>
              <CardDescription>{stat.label}</CardDescription>
              <CardTitle className="text-2xl">{stat.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Contacts &amp; leads</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Total contacts</p>
            <p className="text-lg font-medium">{summary.contactCount}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Open leads</p>
            <p className="text-lg font-medium">{summary.openLeadCount} / {summary.leadCount}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Activity this month</p>
            <p className="text-lg font-medium">{summary.activityCountThisMonth}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <TrendingUp className="size-5 text-muted-foreground" />
            <CardTitle>Open pipeline by stage</CardTitle>
          </div>
          <CardDescription>{summary.openDealCount} open deal{summary.openDealCount === 1 ? "" : "s"} total.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {Object.keys(STAGE_LABELS).map((stage) => (
            <div key={stage} className="flex items-center justify-between rounded-lg border p-3">
              <p className="text-sm font-medium">{STAGE_LABELS[stage]}</p>
              <p className="text-sm text-muted-foreground">{summary.stageCounts[stage] ?? 0}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
