import { Store, ShoppingBag, ReceiptText, Undo2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { OverviewMetricCard } from "@/components/dashboard/overview-metric-card";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { formatMoney } from "@/lib/currency";
import { getPosSummary } from "@/modules/pos/service";

export default async function PosOverviewPage() {
  const tenant = await requireModuleAccess("pos");
  const summary = await getPosSummary(tenant.organizationId);

  const stats = [
    { label: "Open sessions", value: summary.openSessionCount, description: "Registers currently open for checkout", icon: <Store className="size-4" />, href: "/app/pos/registers" },
    { label: "Today's sales", value: `${summary.todaysSalesCount} (${formatMoney(summary.todaysSalesTotal, tenant.organization.currency)})`, description: "Sales recorded so far today", icon: <ShoppingBag className="size-4" />, href: "/app/pos/sell" },
    { label: "All-time sales", value: `${summary.allTimeSalesCount} (${formatMoney(summary.allTimeSalesTotal, tenant.organization.currency)})`, description: "Total sales recorded across all registers", icon: <ReceiptText className="size-4" />, href: "/app/pos/sales" },
    { label: "Refunded sales", value: summary.refundedCount, description: "Sales that have been refunded", icon: <Undo2 className="size-4" />, href: "/app/pos/sales" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="POS Overview" description="Registers, checkout activity, and same-day sales at a glance." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => <OverviewMetricCard key={stat.label} {...stat} />)}
      </div>
    </div>
  );
}
