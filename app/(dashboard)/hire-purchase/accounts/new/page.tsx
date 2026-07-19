import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { getCustomers, getProducts } from "@/lib/hire-purchase";
import { requirePermission, PERMISSIONS } from "@/lib/permissions";
import { createAccount } from "@/lib/hire-purchase/actions/accounts";

const field = "w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/15";
const label = "block text-sm text-slate-300";

export default async function NewAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; customerId?: string }>;
}) {
  const tenant = await requirePermission(PERMISSIONS.HIREPURCHASE_ACCOUNTS_MANAGE);
  const { error, customerId } = await searchParams;
  const [customers, products] = await Promise.all([getCustomers(tenant.organizationId), getProducts(tenant.organizationId)]);
  const activeProducts = products.filter((p) => p.active);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <DashboardShell title="New account" subtitle="Open an installment account for a customer against an active product.">
      <div className="glass-card mx-auto max-w-2xl rounded-3xl border border-white/10 p-8">
        {error ? (
          <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {decodeURIComponent(error)}
          </div>
        ) : null}
        <form action={createAccount} className="space-y-5">
          <label className={label}>
            <span className="mb-2 inline-block">Customer</span>
            <select name="customerId" required defaultValue={customerId ?? ""} className={field}>
              <option value="">Select customer</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.fullName} ({c.customerCode})
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            <span className="mb-2 inline-block">Product</span>
            <select name="productId" required className={field}>
              <option value="">Select product</option>
              {activeProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.price} over {p.duration} days
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            <span className="mb-2 inline-block">Start date</span>
            <input name="startDate" type="date" required max={today} defaultValue={today} className={field} />
          </label>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="mb-4 text-xs uppercase tracking-[0.24em] text-slate-400">Optional: record first payment</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={label}>
                <span className="mb-2 inline-block">Amount</span>
                <input name="amount" type="number" min="0" step="0.01" className={field} />
              </label>
              <label className={label}>
                <span className="mb-2 inline-block">Payment date</span>
                <input name="paymentDate" type="date" max={today} className={field} />
              </label>
              <label className={label}>
                <span className="mb-2 inline-block">Method</span>
                <select name="method" className={field}>
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
            </div>
          </div>

          <button
            type="submit"
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-cyan-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
          >
            Open account
          </button>
        </form>
      </div>
    </DashboardShell>
  );
}
