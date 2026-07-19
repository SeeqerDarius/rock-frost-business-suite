import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { SectionTable } from "@/components/fleet/SectionTable";
import { getMaintenanceRequests, type MaintenanceRecord } from "@/lib/fleet";
import { requirePermission, PERMISSIONS } from "@/lib/permissions";

export default async function MaintenancePage() {
  const tenant = await requirePermission(PERMISSIONS.FLEET_MAINTENANCE_MANAGE);
  const recentMaintenance = await getMaintenanceRequests(tenant.organizationId);

  return (
    <DashboardShell
      title="Maintenance"
      subtitle="Track fault reports, approval timelines, mechanic assignments, and completion verification."
    >
      <SectionTable
        title="Maintenance workflow"
        columns={["Request", "Vehicle", "Fault", "Status", "Mechanic", "Cost"]}
        rows={recentMaintenance.map((item: MaintenanceRecord) => [
          item.id,
          item.vehicle,
          item.fault,
          item.status,
          item.mechanic,
          item.cost,
        ])}
      />
      <div className="mt-6 grid gap-6 md:grid-cols-3">
        {recentMaintenance.map((item) => (
          <div key={item.id} className="glass-card rounded-3xl border border-white/10 p-6 shadow-sm shadow-blue-500/10">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-cyan-200/80">{item.id}</p>
                <h3 className="mt-2 text-xl font-semibold text-white">{item.vehicle}</h3>
              </div>
              <span className="rounded-full bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-slate-200">
                {item.status}
              </span>
            </div>
            <p className="mt-4 text-sm text-slate-300">{item.fault}</p>
            <div className="mt-5 space-y-3 text-sm text-slate-300">
              <p><span className="font-semibold text-white">Requested by:</span> {item.requestedBy}</p>
              <p><span className="font-semibold text-white">Timeline:</span> {item.timeline}</p>
              <p><span className="font-semibold text-white">Mechanic:</span> {item.mechanic}</p>
              <p><span className="font-semibold text-white">Request date:</span> {item.requestDate}</p>
            </div>
          </div>
        ))}
      </div>
    </DashboardShell>
  );
}
