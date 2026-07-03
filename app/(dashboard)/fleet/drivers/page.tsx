import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { SectionTable } from "@/components/fleet/SectionTable";
import { driverRecords } from "@/lib/fleet";

export default function DriversPage() {
  return (
    <DashboardShell
      title="Drivers"
      subtitle="Driver profiles, licence details, vehicle assignment, and performance insights."
    >
      <div className="grid gap-6 md:grid-cols-2">
        {driverRecords.map((driver) => (
          <div key={driver.id} className="glass-card rounded-3xl border border-white/10 p-6 shadow-sm shadow-blue-500/10">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-cyan-200/80">Driver</p>
                <h3 className="mt-3 text-2xl font-semibold text-white">{driver.name}</h3>
                <p className="mt-2 text-sm text-slate-400">Licence {driver.licence}</p>
              </div>
              <div className="rounded-3xl bg-white/5 px-4 py-2 text-sm font-semibold text-slate-100">{driver.status}</div>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-3xl border border-white/5 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Assigned vehicle</p>
                <p className="mt-2 text-sm text-slate-100">{driver.assignedVehicle}</p>
                <p className="mt-2 text-xs text-slate-500">Since {driver.startDate}</p>
              </div>
              <div className="rounded-3xl border border-white/5 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Performance</p>
                <p className="mt-2 text-2xl font-semibold text-white">{driver.performance}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-8">
        <SectionTable
          title="Driver registry"
          columns={["Driver", "Licence", "Vehicle", "Status", "Start date", "Email"]}
          rows={driverRecords.map((driver) => [
            driver.name,
            driver.licence,
            driver.assignedVehicle,
            driver.status,
            driver.startDate,
            driver.email,
          ])}
        />
      </div>
    </DashboardShell>
  );
}
