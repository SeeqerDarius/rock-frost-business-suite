import { notFound } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { SectionTable } from "@/components/fleet/SectionTable";
import { StatusBadge } from "@/components/fleet/StatusBadge";
import { db } from "@/lib/db";
import { isDormantReactivationEligible } from "@/lib/hire-purchase";
import { requirePermission, PERMISSIONS } from "@/lib/permissions";
import { recordPayment } from "@/lib/hire-purchase/actions/payments";
import { updateAccountDeliveryStatus, reactivateDormantAccount, deleteAccount } from "@/lib/hire-purchase/actions/accounts";

const field = "w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/15";
const label = "block text-sm text-slate-300";

function money(value: unknown) {
  const n = typeof value === "number" ? value : Number(value);
  return `GHS ${n.toLocaleString("en-US")}`;
}

export default async function AccountDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; updated?: string; payment?: string }>;
}) {
  const tenant = await requirePermission(PERMISSIONS.HIREPURCHASE_ACCOUNTS_MANAGE);
  const { id } = await params;
  const { error, updated, payment } = await searchParams;

  const account = await db.hirePurchaseAccount.findFirst({
    where: { id, organizationId: tenant.organizationId },
    include: {
      customer: true,
      product: true,
      payments: { orderBy: { paymentDate: "desc" } },
    },
  });
  if (!account) notFound();

  const today = new Date().toISOString().slice(0, 10);
  const progressPercent = Number(account.targetAmount) > 0 ? Math.round((Number(account.totalPaid) / Number(account.targetAmount)) * 100) : 0;
  const reactivationEligible = isDormantReactivationEligible(account);
  const canDeliver = account.status === "COMPLETED" && Number(account.balance) <= 0;

  return (
    <DashboardShell
      title={`${account.customer.fullName} — ${account.product.name}`}
      subtitle={`Account opened ${account.startDate.toISOString().slice(0, 10)} · Expected completion ${account.expectedEndDate.toISOString().slice(0, 10)}`}
    >
      {error ? (
        <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{decodeURIComponent(error)}</div>
      ) : null}
      {payment ? (
        <div className="mb-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          Payment recorded — receipt {decodeURIComponent(payment)}
        </div>
      ) : null}
      {updated ? (
        <div className="mb-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">Updated successfully.</div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="glass-card rounded-3xl border border-white/10 p-6 lg:col-span-1">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Status</p>
            <StatusBadge status={account.status} />
          </div>
          <div className="mt-6 space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-slate-400">Target amount</span><span className="text-slate-100">{money(account.targetAmount)}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Total paid</span><span className="text-slate-100">{money(account.totalPaid)}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Balance</span><span className="text-slate-100">{money(account.balance)}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Daily amount</span><span className="text-slate-100">{money(account.dailyAmount)}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Delivery</span><span className="text-slate-100">{account.deliveryStatus}</span></div>
          </div>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-cyan-400" style={{ width: `${Math.min(progressPercent, 100)}%` }} />
          </div>
          <p className="mt-2 text-xs text-slate-400">{progressPercent}% paid</p>

          {canDeliver ? (
            <form action={updateAccountDeliveryStatus} className="mt-6 border-t border-white/10 pt-5">
              <input type="hidden" name="id" value={account.id} />
              <input type="hidden" name="deliveryStatus" value={account.deliveryStatus === "DELIVERED" ? "PENDING" : "DELIVERED"} />
              <button type="submit" className="w-full rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold text-slate-100 transition hover:bg-white/10">
                Mark as {account.deliveryStatus === "DELIVERED" ? "pending delivery" : "delivered"}
              </button>
            </form>
          ) : null}

          {reactivationEligible ? (
            <form action={reactivateDormantAccount} className="mt-4 border-t border-white/10 pt-5">
              <input type="hidden" name="id" value={account.id} />
              <label className={label}>
                <span className="mb-2 inline-block text-xs">Type REACTIVATE to confirm (a service fee applies)</span>
                <input name="confirmation" required className={field} />
              </label>
              <button type="submit" className="mt-3 w-full rounded-full border border-amber-500/30 px-5 py-2.5 text-sm font-semibold text-amber-300 transition hover:bg-amber-500/10">
                Reactivate account
              </button>
            </form>
          ) : null}

          <form action={deleteAccount} className="mt-4 border-t border-white/10 pt-5">
            <input type="hidden" name="id" value={account.id} />
            <label className={label}>
              <span className="mb-2 inline-block text-xs">Type DELETE to confirm</span>
              <input name="confirmation" required className={field} />
            </label>
            <button type="submit" className="mt-3 w-full rounded-full border border-red-500/30 px-5 py-2.5 text-sm font-semibold text-red-300 transition hover:bg-red-500/10">
              Delete account
            </button>
          </form>
        </div>

        <div className="glass-card rounded-3xl border border-white/10 p-6 lg:col-span-2">
          <h3 className="text-lg font-semibold text-white">Record a payment</h3>
          <form action={recordPayment} className="mt-5 grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="accountId" value={account.id} />
            <label className={label}>
              <span className="mb-2 inline-block">Amount</span>
              <input name="amount" type="number" min="0.01" step="0.01" required className={field} />
            </label>
            <label className={label}>
              <span className="mb-2 inline-block">Payment date</span>
              <input name="paymentDate" type="date" max={today} defaultValue={today} required className={field} />
            </label>
            <label className={label}>
              <span className="mb-2 inline-block">Method</span>
              <select name="method" required className={field}>
                <option value="">Select method</option>
                <option value="CASH">Cash</option>
                <option value="MOBILE_MONEY">Mobile money</option>
                <option value="BANK_TRANSFER">Bank transfer</option>
              </select>
            </label>
            <label className={label}>
              <span className="mb-2 inline-block">Notes</span>
              <input name="notes" className={field} />
            </label>
            <div className="sm:col-span-2">
              <button type="submit" className="w-full rounded-full bg-cyan-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 sm:w-auto">
                Record payment
              </button>
            </div>
          </form>

          <div className="mt-8">
            <SectionTable
              title={`Payment history (${account.payments.length})`}
              columns={["Receipt", "Date", "Amount", "Method", "Notes"]}
              rows={account.payments.map((p) => [p.receiptNo, p.paymentDate.toISOString().slice(0, 10), money(p.amount), p.method, p.notes ?? "—"])}
            />
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
