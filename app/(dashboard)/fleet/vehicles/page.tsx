import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { SectionTable } from "@/components/fleet/SectionTable";
import { StatusBadge } from "@/components/fleet/StatusBadge";
import { getVehicles } from "@/lib/fleet";
import { requirePermission, PERMISSIONS } from "@/lib/permissions";

export default async function VehiclesPage() {
  const tenant = await requirePermission(PERMISSIONS.FLEET_VEHICLES_MANAGE);
  const vehicleRecords = await getVehicles(tenant.organizationId);

  return (
    <DashboardShell
      title="Vehicles"
      subtitle="Manage vehicle profiles, document status, service cycles, and assignment details."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        {vehicleRecords.map((vehicle) => (
          <div key={vehicle.id} className="glass-card rounded-3xl border border-white/10 p-6 shadow-sm shadow-blue-500/10">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-cyan-200/80">{vehicle.id}</p>
                <h3 className="mt-3 text-2xl font-semibold text-white">{vehicle.plate}</h3>
                <p className="mt-2 text-sm text-slate-400">{vehicle.type} · {vehicle.location}</p>
              </div>
              <StatusBadge status={vehicle.status} />
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-3xl border border-white/5 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Owner</p>
                <p className="mt-2 font-semibold text-slate-100">{vehicle.owner}</p>
              </div>
              <div className="rounded-3xl border border-white/5 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Driver</p>
                <p className="mt-2 font-semibold text-slate-100">{vehicle.driver}</p>
              </div>
              <div className="rounded-3xl border border-white/5 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Doc status</p>
                <p className="mt-2 font-semibold text-slate-100">{vehicle.documentStatus}</p>
              </div>
              <div className="rounded-3xl border border-white/5 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Next service</p>
                <p className="mt-2 font-semibold text-slate-100">{vehicle.nextService}</p>
              </div>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-3xl border border-white/5 bg-white/5 p-4 text-sm text-slate-300">
                <p className="uppercase tracking-[0.22em] text-slate-500">Mileage</p>
                <p className="mt-2 font-semibold text-slate-100">{vehicle.mileage}</p>
              </div>
              <div className="rounded-3xl border border-white/5 bg-white/5 p-4 text-sm text-slate-300">
                <p className="uppercase tracking-[0.22em] text-slate-500">Service history</p>
                <p className="mt-2 font-semibold text-slate-100">{vehicle.serviceHistory}</p>
              </div>
              <div className="rounded-3xl border border-white/5 bg-white/5 p-4 text-sm text-slate-300">
                <p className="uppercase tracking-[0.22em] text-slate-500">Location</p>
                <p className="mt-2 font-semibold text-slate-100">{vehicle.location}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-8">
        <SectionTable
          title="Vehicle registry"
          columns={["Vehicle", "Type", "Owner", "Driver", "Status", "Next service"]}
          rows={vehicleRecords.map((vehicle) => [
            vehicle.id,
            vehicle.type,
            vehicle.owner,
            vehicle.driver,
            vehicle.status,
            vehicle.nextService,
          ])}
        />
      </div>
    </DashboardShell>
  );
}
