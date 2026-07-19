import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { MetricCard } from "@/components/fleet/MetricCard";
import { SectionTable } from "@/components/fleet/SectionTable";
import { getDashboardMetrics, getMaintenanceRequests, getPayments } from "@/lib/fleet";
import { requireCurrentTenant } from "@/lib/tenant";

export default async function DashboardPage() {
  const tenant = await requireCurrentTenant();
  const [dashboardMetrics, payments, maintenance] = await Promise.all([
    getDashboardMetrics(tenant.organizationId),
    getPayments(tenant.organizationId),
    getMaintenanceRequests(tenant.organizationId),
  ]);
  const recentPayments = payments.slice(0, 3);
  const recentMaintenance = maintenance.slice(0, 3);

  return (
    <DashboardShell
      title="Fleet dashboard"
      subtitle="A premium command center for fleet operations, performance, and multi-company readiness."
    >
      <div className="grid gap-6 xl:grid-cols-3">
        {dashboardMetrics.slice(0, 6).map((metric) => (
          <MetricCard
            key={metric.label}
            label={metric.label}
            value={metric.value}
            note={metric.note}
            icon={metric.icon}
          />
        ))}
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <SectionTable
          title="Recent payments"
          columns={["Payment", "Date", "Type", "Amount", "Status", "Verified"]}
          rows={recentPayments.map((payment) => [
            payment.reference,
            payment.date,
            payment.type,
            payment.amount,
            payment.status,
            payment.verified ? "Yes" : "No",
          ])}
        />
        <SectionTable
          title="Recent maintenance requests"
          columns={["Request", "Vehicle", "Fault", "Status", "Mechanic", "Cost"]}
          rows={recentMaintenance.map((maintenance) => [
            maintenance.id,
            maintenance.vehicle,
            maintenance.fault,
            maintenance.status,
            maintenance.mechanic,
            maintenance.cost,
          ])}
        />
      </div>
    </DashboardShell>
  );
}
