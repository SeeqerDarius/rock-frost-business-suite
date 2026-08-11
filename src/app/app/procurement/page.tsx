import { FileText, PackageCheck, Wallet, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { OverviewMetricCard } from "@/components/dashboard/overview-metric-card";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { getProcurementSummary } from "@/modules/procurement/service";

export default async function ProcurementOverviewPage() {
  const tenant = await requireModuleAccess("procurement");
  const summary = await getProcurementSummary(tenant.organizationId);

  const stats = [
    { label: "Pending requests", value: summary.pendingRequestCount, description: "Purchase requests awaiting approval", icon: <FileText className="size-4" />, href: "/app/procurement/requests" },
    { label: "Open orders", value: summary.openOrderCount, description: "Purchase orders not yet fully received", icon: <PackageCheck className="size-4" />, href: "/app/procurement/orders" },
    { label: "Open order value", value: summary.openOrderValue.toFixed(2), description: "Committed value of open orders", icon: <Wallet className="size-4" />, href: "/app/procurement/orders" },
    { label: "Received orders", value: summary.receivedOrderCount, description: "Orders fully received to date", icon: <CheckCircle2 className="size-4" />, href: "/app/procurement/orders" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Procurement Overview" description="Purchase requests, open orders, and vendor spend at a glance." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => <OverviewMetricCard key={stat.label} {...stat} />)}
      </div>
    </div>
  );
}
