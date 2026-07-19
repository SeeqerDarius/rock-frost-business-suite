import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { MetricCard } from "@/components/fleet/MetricCard";
import { SectionTable } from "@/components/fleet/SectionTable";
import { getReportSummary, getProcurementList } from "@/lib/hire-purchase";
import { requirePermission, PERMISSIONS } from "@/lib/permissions";

export default async function HirePurchaseReportsPage() {
  const tenant = await requirePermission(PERMISSIONS.HIREPURCHASE_REPORTS_VIEW);
  const [summary, procurement] = await Promise.all([getReportSummary(tenant.organizationId), getProcurementList(tenant.organizationId)]);

  return (
    <DashboardShell title="Reports" subtitle="Collections, outstanding balances, payroll, and procurement in one view.">
      <div className="grid gap-6 xl:grid-cols-3">
        {summary.map((s) => (
          <MetricCard key={s.name} label={s.name} value={s.value} note={s.note} icon="📊" />
        ))}
      </div>

      <div className="mt-8">
        <SectionTable
          title="Procurement list"
          columns={["Product", "Category", "Qualifying accounts", "Landed unit cost", "Total cost", "Avg. progress", "Highest progress"]}
          rows={procurement.map((p) => [
            p.productName,
            p.category,
            String(p.quantity),
            p.landedUnitCost,
            p.totalCost,
            `${p.averageProgress}%`,
            `${p.highestProgress}%`,
          ])}
        />
      </div>
    </DashboardShell>
  );
}
