import { Handshake, Lock, ReceiptText, UsersRound } from "lucide-react";
import { AttentionQueue, type AttentionQueueItem } from "@/components/dashboard/attention-queue";
import { BreakdownDonutChart } from "@/components/dashboard/charts";
import { OverviewMetricCard } from "@/components/dashboard/overview-metric-card";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { createOrganizationFormatter } from "@/lib/org-format";
import { getSalesOverview } from "@/modules/analytics/service";

export default async function AnalyticsSalesPage() {
  const tenant = await requireModuleAccess("analytics");

  if (!hasPermission(tenant, PERMISSIONS.ANALYTICS_SALES_VIEW)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Sales & CRM" description="CRM pipeline and installment collections rolled up." />
        <EmptyState icon={Lock} title="You don't have access to this page" description="Sales analytics are limited to roles with sales-reporting permissions." />
      </div>
    );
  }

  const { crm, installment } = await getSalesOverview(tenant.organizationId, tenant.enabledModuleKeys);
  const money = createOrganizationFormatter(tenant.organization).money;

  if (!crm && !installment) {
    return (
      <div className="space-y-6">
        <PageHeader title="Sales & CRM" description="CRM pipeline and installment collections rolled up." />
        <EmptyState icon={Handshake} title="No sales modules enabled" description="Enable CRM and/or Installment Management for this organization to see sales analytics here." />
      </div>
    );
  }

  const stats = [
    crm ? { label: "Open pipeline", value: money(crm.pipelineValue), description: `${crm.openDealCount} deal${crm.openDealCount === 1 ? "" : "s"} have not closed yet.`, icon: <Handshake className="size-4" />, href: "/app/crm" } : null,
    crm ? { label: "Win rate", value: `${crm.winRate.toFixed(0)}%`, description: "Won deals divided by all closed deals.", icon: <Handshake className="size-4" />, href: "/app/crm" } : null,
    crm ? { label: "Sales activity this month", value: crm.activityCountThisMonth, description: "Recorded CRM activities since the start of the current month.", icon: <UsersRound className="size-4" />, href: "/app/crm" } : null,
    installment ? { label: "Collections", value: money(installment.totalCollected), description: "Confirmed installment payments collected to date.", icon: <ReceiptText className="size-4" />, href: "/app/installment" } : null,
    installment ? { label: "Expected receivables", value: money(installment.expectedReceivables), description: "Contractual installments expected across customer accounts.", icon: <ReceiptText className="size-4" />, href: "/app/installment" } : null,
    installment ? { label: "Open credits", value: money(installment.openCreditsTotal), description: `${installment.openCreditsCount} active credit${installment.openCreditsCount === 1 ? "" : "s"} remain open.`, icon: <ReceiptText className="size-4" />, href: "/app/installment" } : null,
  ].filter((stat): stat is NonNullable<typeof stat> => stat !== null);

  const attentionCandidates: (AttentionQueueItem | null)[] = [
    crm?.openLeadCount ? { id: "open-leads", title: "Open leads", value: crm.openLeadCount, description: `${crm.contactCount} contacts are available for follow-up and qualification.`, href: "/app/crm", severity: "review" } : null,
    installment?.openCreditsCount ? { id: "open-credits", title: "Open installment credits", value: installment.openCreditsCount, description: `${money(installment.openCreditsTotal)} remains on active customer credit arrangements.`, href: "/app/installment", severity: "review" } : null,
  ];
  const attentionItems = attentionCandidates.filter((item): item is AttentionQueueItem => item !== null);

  const pipelineStages = crm ? Object.entries(crm.stageCounts).map(([label, value]) => ({ label, value })) : [];

  return (
    <div className="space-y-6">
      <PageHeader title="Sales & CRM" description="Current sales pipeline and installment-collection snapshot. Values retain their source-module definitions." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {stats.map((stat) => <OverviewMetricCard key={stat.label} {...stat} />)}
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,0.7fr)]">
        <AttentionQueue items={attentionItems} title="Sales follow-ups" description="Continue each follow-up in its CRM or installment workflow." emptyTitle="No tracked sales follow-ups" emptyDescription="There are no open CRM leads or active installment credits in this snapshot." />
        {crm ? (
          <Card>
            <CardHeader>
              <CardTitle>Open pipeline by stage</CardTitle>
              <CardDescription>Open deals only. Closed won and lost deals are excluded.</CardDescription>
            </CardHeader>
            <CardContent>
              <BreakdownDonutChart data={pipelineStages} valueFormat="count" />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
