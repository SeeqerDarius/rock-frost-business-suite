import { Lock, Handshake } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
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

  if (!crm && !installment) {
    return (
      <div className="space-y-6">
        <PageHeader title="Sales & CRM" description="CRM pipeline and installment collections rolled up." />
        <EmptyState icon={Handshake} title="No sales modules enabled" description="Enable CRM and/or Installment Management for this organization to see sales analytics here." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Sales & CRM" description="CRM pipeline and installment collections rolled up." />

      {crm ? (
        <Card>
          <CardHeader>
            <CardTitle>CRM</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Open pipeline value</p>
              <p className="text-lg font-medium">{crm.pipelineValue.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Win rate</p>
              <p className="text-lg font-medium">{crm.winRate.toFixed(0)}%</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Contacts</p>
              <p className="text-lg font-medium">{crm.contactCount}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Open leads</p>
              <p className="text-lg font-medium">{crm.openLeadCount} / {crm.leadCount}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Open deals</p>
              <p className="text-lg font-medium">{crm.openDealCount}</p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {installment ? (
        <Card>
          <CardHeader>
            <CardTitle>Installment Management</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Total collected</p>
              <p className="text-lg font-medium">{installment.totalCollected.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Expected receivables</p>
              <p className="text-lg font-medium">{installment.expectedReceivables.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Customers / accounts</p>
              <p className="text-lg font-medium">{installment.customerCount} / {installment.accountCount}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Net profit so far</p>
              <p className="text-lg font-medium">{installment.netProfitSoFar.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Open credits</p>
              <p className="text-lg font-medium">{installment.openCreditsCount} ({installment.openCreditsTotal.toFixed(2)})</p>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
