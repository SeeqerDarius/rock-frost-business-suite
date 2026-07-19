import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { SectionTable } from "@/components/fleet/SectionTable";
import { investorSummary } from "@/lib/fleet";
import { requirePermission, PERMISSIONS } from "@/lib/permissions";

export default async function InvestorDashboardPage() {
  await requirePermission(PERMISSIONS.FLEET_INVESTOR_VIEW);

  return (
    <DashboardShell
      title="Investor dashboard"
      subtitle="Read-only portfolio view for revenue trends, receivables, fleet value, and contract performance."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        {investorSummary.map((item) => (
          <div key={item.name} className="glass-card rounded-3xl border border-white/10 p-6 shadow-sm shadow-blue-500/10">
            <p className="text-sm uppercase tracking-[0.24em] text-cyan-200/80">{item.name}</p>
            <h3 className="mt-3 text-3xl font-semibold text-white">{item.value}</h3>
            <p className="mt-2 text-sm text-slate-300">{item.note}</p>
            <p className="mt-4 text-sm font-semibold text-cyan-200">{item.delta}</p>
          </div>
        ))}
      </div>
      <div className="mt-8">
        <SectionTable
          title="Investor insights"
          columns={["Metric", "Value", "Trend", "Note"]}
          rows={investorSummary.map((item) => [item.name, item.value, item.delta, item.note])}
        />
      </div>
    </DashboardShell>
  );
}
