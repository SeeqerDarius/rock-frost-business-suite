import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { SectionTable } from "@/components/fleet/SectionTable";
import { getWorkAndPayContracts } from "@/lib/fleet";
import { requirePermission, PERMISSIONS } from "@/lib/permissions";

export default async function WorkAndPayPage() {
  const tenant = await requirePermission(PERMISSIONS.FLEET_WORKANDPAY_MANAGE);
  const workPayRecords = await getWorkAndPayContracts(tenant.organizationId);

  return (
    <DashboardShell
      title="Work & Pay"
      subtitle="Manage allocation, contract terms, deposits, payment cycles, and balance tracking."
    >
      <SectionTable
        title="Work & pay contracts"
        columns={["Contract", "Vehicle", "Client", "Amount", "Paid", "Outstanding", "Status"]}
        rows={workPayRecords.map((record) => [
          record.contractName,
          record.vehicle,
          record.client,
          record.contractAmount,
          record.paid,
          record.outstanding,
          record.status,
        ])}
      />
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        {workPayRecords.map((record) => (
          <div key={record.id} className="glass-card rounded-3xl border border-white/10 p-6 shadow-sm shadow-blue-500/10">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-cyan-200/80">{record.id}</p>
                <h3 className="mt-2 text-xl font-semibold text-white">{record.contractName}</h3>
              </div>
              <span className="rounded-full bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-slate-200">
                {record.status}
              </span>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 text-sm text-slate-300">
              <div className="rounded-3xl border border-white/5 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Deposit</p>
                <p className="mt-2 text-slate-100">{record.deposit}</p>
              </div>
              <div className="rounded-3xl border border-white/5 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Weekly payment</p>
                <p className="mt-2 text-slate-100">{record.weeklyPayment}</p>
              </div>
              <div className="rounded-3xl border border-white/5 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Remaining</p>
                <p className="mt-2 text-slate-100">{record.remaining}</p>
              </div>
              <div className="rounded-3xl border border-white/5 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Completion</p>
                <p className="mt-2 text-slate-100">{record.completion}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </DashboardShell>
  );
}
