import { Users, PlayCircle, Wallet, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { OverviewMetricCard } from "@/components/dashboard/overview-metric-card";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { getPayrollSummary } from "@/modules/payroll/service";

export default async function PayrollOverviewPage() {
  const tenant = await requireModuleAccess("payroll");
  const summary = await getPayrollSummary(tenant.organizationId);

  const stats = [
    { label: "Employees on payroll", value: summary.employeesWithCompensationCount, description: "Employees with compensation on file", icon: <Users className="size-4" />, href: "/app/payroll/compensation" },
    { label: "Missing compensation", value: summary.employeesWithoutCompensationCount, description: "Employees without a compensation record", icon: <AlertTriangle className="size-4" />, href: "/app/payroll/compensation" },
    { label: "Draft runs", value: summary.draftRunCount, description: "Payroll runs not yet finalized", icon: <PlayCircle className="size-4" />, href: "/app/payroll/runs" },
    { label: "Last run net pay", value: summary.lastRunTotalNet.toFixed(2), description: "Total net pay from the most recent run", icon: <Wallet className="size-4" />, href: "/app/payroll/reports" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Payroll Overview" description="Compensation coverage, run status, and payroll cost at a glance." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => <OverviewMetricCard key={stat.label} {...stat} />)}
      </div>
    </div>
  );
}
