import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { SectionTable } from "@/components/fleet/SectionTable";
import { policyRecords } from "@/lib/fleet";

export default function InsuranceRoadworthyPage() {
  return (
    <DashboardShell
      title="Insurance & Roadworthy"
      subtitle="Monitor policy expiry, renewal readiness, and regulatory compliance alerts."
    >
      <SectionTable
        title="Coverage and certification"
        columns={["Vehicle", "Provider", "Policy #", "Insurance expires", "Roadworthy expires", "Renewal status"]}
        rows={policyRecords.map((policy) => [
          policy.vehicle,
          policy.provider,
          policy.policyNumber,
          policy.insuranceExpires,
          policy.roadworthyExpires,
          policy.renewalStatus,
        ])}
      />
      <div className="mt-6 grid gap-6 md:grid-cols-3">
        {policyRecords.map((policy) => (
          <div key={policy.id} className="glass-card rounded-3xl border border-white/10 p-6 shadow-sm shadow-blue-500/10">
            <p className="text-sm uppercase tracking-[0.24em] text-cyan-200/80">{policy.vehicle}</p>
            <h3 className="mt-3 text-xl font-semibold text-white">{policy.provider}</h3>
            <p className="mt-2 text-sm text-slate-400">Policy {policy.policyNumber}</p>
            <div className="mt-5 space-y-3 text-sm text-slate-300">
              <p>Insurance expires: <span className="font-semibold text-white">{policy.insuranceExpires}</span></p>
              <p>Roadworthy expires: <span className="font-semibold text-white">{policy.roadworthyExpires}</span></p>
              <p>Renewal status: <span className="font-semibold text-white">{policy.renewalStatus}</span></p>
              <p>Alerts: <span className="font-semibold text-white">{policy.alerts}</span></p>
            </div>
          </div>
        ))}
      </div>
    </DashboardShell>
  );
}
