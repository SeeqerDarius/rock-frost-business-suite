import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { SectionTable } from "@/components/fleet/SectionTable";
import { recentPayments } from "@/lib/fleet";

export default function PaymentsPage() {
  return (
    <DashboardShell
      title="Payments"
      subtitle="Review payment verification, reconciliation, and weekly settlement workflows."
    >
      <SectionTable
        title="Payment activity"
        columns={["Reference", "Date", "Type", "Amount", "Status", "Verified"]}
        rows={recentPayments.map((payment) => [
          payment.reference,
          payment.date,
          payment.type,
          payment.amount,
          payment.status,
          payment.verified ? "Yes" : "No",
        ])}
      />
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div className="glass-card rounded-3xl border border-white/10 p-6 shadow-sm shadow-blue-500/10">
          <h3 className="text-xl font-semibold text-white">Payment reconciliation</h3>
          <p className="mt-3 text-sm leading-7 text-slate-300">
            This module tracks sales payments, work-and-pay contract receipts, and verification status for each transaction.
          </p>
          <div className="mt-6 space-y-4 text-sm text-slate-300">
            <p><span className="font-semibold text-white">Receipt placeholder</span> — PDF receipt design and download actions can be added later.</p>
            <p><span className="font-semibold text-white">Integration placeholder</span> — Connect to payment gateways when the platform is ready.</p>
          </div>
        </div>
        <div className="glass-card rounded-3xl border border-white/10 p-6 shadow-sm shadow-blue-500/10">
          <h3 className="text-xl font-semibold text-white">Verification workflow</h3>
          <p className="mt-3 text-sm leading-7 text-slate-300">
            Use this layout to add approvals, reconciliation checks, and audit trails for weekly and contract payments.
          </p>
          <div className="mt-6 space-y-4 text-sm text-slate-300">
            <p>Payment audit status</p>
            <p>Manual review steps</p>
            <p>Reconciliation reports and export actions.</p>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
