import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { SectionTable } from "@/components/fleet/SectionTable";
import { getReportSummary } from "@/lib/fleet";
import { requirePermission, PERMISSIONS } from "@/lib/permissions";

export default async function ReportsPage() {
  const tenant = await requirePermission(PERMISSIONS.FLEET_REPORTS_VIEW);
  const reportSummary = await getReportSummary(tenant.organizationId);

  return (
    <DashboardShell
      title="Reports"
      subtitle="Fleet, driver, owner, maintenance, and revenue analytics designed for business performance review."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        {reportSummary.map((report) => (
          <div key={report.name} className="glass-card rounded-3xl border border-white/10 p-6 shadow-sm shadow-blue-500/10">
            <p className="text-sm uppercase tracking-[0.24em] text-cyan-200/80">{report.name}</p>
            <h3 className="mt-3 text-3xl font-semibold text-white">{report.value}</h3>
            <p className="mt-2 text-sm text-slate-300">{report.note}</p>
            <p className="mt-4 text-xs uppercase tracking-[0.24em] text-slate-500">Change</p>
            <p className="text-sm font-semibold text-cyan-200">{report.delta}</p>
          </div>
        ))}
      </div>
      <div className="mt-8 grid gap-6">
        <SectionTable
          title="Report exports"
          columns={["Report type", "Scope", "Status", "Action"]}
          rows={[
            ["Fleet report", "Monthly", "Ready", "Export"],
            ["Driver report", "This quarter", "Ready", "Export"],
            ["Owner report", "Custom range", "Ready", "Export"],
            ["Maintenance report", "Pending approval", "Draft", "Review"],
          ]}
        />
      </div>
    </DashboardShell>
  );
}
