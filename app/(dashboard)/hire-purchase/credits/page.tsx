import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { getCredits } from "@/lib/hire-purchase";
import { requirePermission, PERMISSIONS } from "@/lib/permissions";
import { markCreditRefunded } from "@/lib/hire-purchase/actions/credits";

const field = "w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/15";

export default async function CreditsPage({ searchParams }: { searchParams: Promise<{ error?: string; refunded?: string }> }) {
  const tenant = await requirePermission(PERMISSIONS.HIREPURCHASE_CREDITS_MANAGE);
  const { error, refunded } = await searchParams;
  const credits = await getCredits(tenant.organizationId);

  return (
    <DashboardShell title="Credits" subtitle="Overpayments and account-closure refunds owed back to customers.">
      {error ? <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{decodeURIComponent(error)}</div> : null}
      {refunded ? <div className="mb-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">Credit marked as refunded.</div> : null}

      <div className="glass-card overflow-hidden rounded-3xl border border-white/10 shadow-sm shadow-blue-500/10">
        <div className="border-b border-white/10 bg-[#02060e]/95 px-6 py-4">
          <h3 className="text-lg font-semibold text-white">Credit ledger ({credits.length})</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0 text-left text-sm text-slate-200">
            <thead className="bg-[#02060e]/90 text-slate-400">
              <tr>
                {["Customer", "Amount", "Remaining", "Status", "Source", "Notes", ""].map((c) => (
                  <th key={c} className="px-6 py-4 font-semibold tracking-[0.02em]">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {credits.map((c, index) => (
                <tr key={c.id} className={index % 2 === 0 ? "bg-white/2" : "bg-white/5"}>
                  <td className="px-6 py-4">{c.customerName}</td>
                  <td className="px-6 py-4">{c.amount}</td>
                  <td className="px-6 py-4">{c.remainingAmount}</td>
                  <td className="px-6 py-4">{c.status}</td>
                  <td className="px-6 py-4">{c.source}</td>
                  <td className="px-6 py-4">{c.notes}</td>
                  <td className="px-6 py-4">
                    {c.status === "Open" ? (
                      <form action={markCreditRefunded} className="flex items-center gap-2">
                        <input type="hidden" name="id" value={c.id} />
                        <input name="confirmation" placeholder="Type REFUND" required className={field + " w-32"} />
                        <button type="submit" className="rounded-full bg-cyan-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400">
                          Refund
                        </button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {credits.length === 0 ? <p className="mt-4 text-sm text-slate-400">No credits recorded yet.</p> : null}
    </DashboardShell>
  );
}
