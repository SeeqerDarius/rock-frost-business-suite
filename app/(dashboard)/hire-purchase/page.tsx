import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { MetricCard } from "@/components/fleet/MetricCard";
import { SectionTable } from "@/components/fleet/SectionTable";
import { getDashboardMetrics, getAccounts, getCredits, getProcurementList } from "@/lib/hire-purchase";
import { requirePermission, PERMISSIONS } from "@/lib/permissions";

export default async function HirePurchaseDashboardPage() {
  const tenant = await requirePermission(PERMISSIONS.HIREPURCHASE_VIEW);
  const [metrics, accounts, credits, procurement] = await Promise.all([
    getDashboardMetrics(tenant.organizationId),
    getAccounts(tenant.organizationId),
    getCredits(tenant.organizationId),
    getProcurementList(tenant.organizationId),
  ]);

  const recentAccounts = accounts.slice(0, 6);
  const openCredits = credits.filter((c) => c.status === "Open").slice(0, 6);

  return (
    <DashboardShell
      title="Hire Purchase"
      subtitle="Installment contracts, customer accounts, collections, and procurement in one place."
    >
      <div className="grid gap-6 xl:grid-cols-4">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} label={metric.label} value={metric.value} note={metric.note} icon={metric.icon} />
        ))}
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <SectionTable
          title="Recent accounts"
          columns={["Customer", "Product", "Paid", "Balance", "Status"]}
          rows={recentAccounts.map((a) => [a.customerName, a.productName, a.totalPaid, a.balance, a.status])}
        />
        <SectionTable
          title="Open credits (overpayments / refunds)"
          columns={["Customer", "Amount", "Remaining", "Source"]}
          rows={openCredits.map((c) => [c.customerName, c.amount, c.remainingAmount, c.source])}
        />
      </div>

      <div className="mt-8">
        <SectionTable
          title="Procurement — accounts past the payment threshold"
          columns={["Product", "Category", "Qualifying accounts", "Landed unit cost", "Total cost", "Avg. progress"]}
          rows={procurement.map((p) => [p.productName, p.category, String(p.quantity), p.landedUnitCost, p.totalCost, `${p.averageProgress}%`])}
        />
      </div>
    </DashboardShell>
  );
}
