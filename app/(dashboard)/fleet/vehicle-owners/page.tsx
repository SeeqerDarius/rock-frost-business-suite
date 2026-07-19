import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { SectionTable } from "@/components/fleet/SectionTable";
import { getOwners } from "@/lib/fleet";
import { requirePermission, PERMISSIONS } from "@/lib/permissions";

export default async function VehicleOwnersPage() {
  const tenant = await requirePermission(PERMISSIONS.FLEET_OWNERS_MANAGE);
  const ownerRecords = await getOwners(tenant.organizationId);

  return (
    <DashboardShell
      title="Vehicle owners"
      subtitle="A centralized contact and asset profile list for owner relationships and revenue tracking."
    >
      <div className="grid gap-6 md:grid-cols-2">
        {ownerRecords.map((owner) => (
          <div key={owner.id} className="glass-card rounded-3xl border border-white/10 p-6 shadow-sm shadow-blue-500/10">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-cyan-200/80">Owner profile</p>
                <h3 className="mt-3 text-2xl font-semibold text-white">{owner.name}</h3>
                <p className="mt-2 text-sm text-slate-400">{owner.business}</p>
              </div>
              <div className="rounded-3xl bg-white/5 px-4 py-2 text-sm font-semibold text-slate-100">{owner.vehicles} vehicles</div>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-3xl border border-white/5 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Contact</p>
                <p className="mt-2 text-sm text-slate-100">{owner.phone}</p>
                <p className="mt-1 text-sm text-slate-100">{owner.email}</p>
              </div>
              <div className="rounded-3xl border border-white/5 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Revenue</p>
                <p className="mt-2 text-2xl font-semibold text-white">{owner.revenue}</p>
                <p className="mt-2 text-sm text-slate-400">{owner.history}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-8">
        <SectionTable
          title="Owner performance"
          columns={["Owner", "Contact", "Vehicles", "Revenue", "History"]}
          rows={ownerRecords.map((owner) => [
            owner.name,
            owner.email,
            String(owner.vehicles),
            owner.revenue,
            owner.history,
          ])}
        />
      </div>
    </DashboardShell>
  );
}
