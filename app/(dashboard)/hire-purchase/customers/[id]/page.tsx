import Link from "next/link";
import { notFound } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { SectionTable } from "@/components/fleet/SectionTable";
import { StatusBadge } from "@/components/fleet/StatusBadge";
import { db } from "@/lib/db";
import { getAccounts } from "@/lib/hire-purchase";
import { requirePermission, PERMISSIONS } from "@/lib/permissions";
import { updateCustomer, deleteCustomer } from "@/lib/hire-purchase/actions/customers";

const field = "w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/15";
const label = "block text-sm text-slate-300";

export default async function CustomerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const tenant = await requirePermission(PERMISSIONS.HIREPURCHASE_CUSTOMERS_MANAGE);
  const { id } = await params;
  const { error } = await searchParams;

  const customer = await db.hirePurchaseCustomer.findFirst({
    where: { id, organizationId: tenant.organizationId },
    include: { staff: { select: { fullName: true } } },
  });
  if (!customer) notFound();

  const accounts = (await getAccounts(tenant.organizationId)).filter((a) => a.customerId === id);

  return (
    <DashboardShell title={customer.fullName} subtitle={`Customer ${customer.customerCode} · Assigned to ${customer.staff.fullName}`}>
      {error ? (
        <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {decodeURIComponent(error)}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="glass-card rounded-3xl border border-white/10 p-6">
          <h3 className="text-lg font-semibold text-white">Edit details</h3>
          <form action={updateCustomer} className="mt-5 space-y-4">
            <input type="hidden" name="id" value={customer.id} />
            <label className={label}>
              <span className="mb-2 inline-block">Full name</span>
              <input name="fullName" defaultValue={customer.fullName} required className={field} />
            </label>
            <label className={label}>
              <span className="mb-2 inline-block">Phone</span>
              <input name="phone" defaultValue={customer.phone ?? ""} className={field} />
            </label>
            <label className={label}>
              <span className="mb-2 inline-block">Address</span>
              <input name="address" defaultValue={customer.address ?? ""} className={field} />
            </label>
            <label className={label}>
              <span className="mb-2 inline-block">National ID</span>
              <input name="nationalId" defaultValue={customer.nationalId ?? ""} className={field} />
            </label>
            <button type="submit" className="rounded-full bg-cyan-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400">
              Save changes
            </button>
          </form>
        </div>

        <div className="glass-card rounded-3xl border border-white/10 p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">Accounts</h3>
            <Link href={`/hire-purchase/accounts/new?customerId=${customer.id}`} className="text-sm text-cyan-300 underline">
              + New account
            </Link>
          </div>
          <div className="mt-5 space-y-3">
            {accounts.length === 0 ? <p className="text-sm text-slate-400">No installment accounts yet.</p> : null}
            {accounts.map((a) => (
              <Link
                key={a.id}
                href={`/hire-purchase/accounts/${a.id}`}
                className="flex items-center justify-between rounded-2xl border border-white/5 bg-white/5 p-4 transition hover:bg-white/10"
              >
                <div>
                  <p className="font-semibold text-slate-100">{a.productName}</p>
                  <p className="text-xs text-slate-400">{a.totalPaid} paid of {a.targetAmount}</p>
                </div>
                <StatusBadge status={a.status} />
              </Link>
            ))}
          </div>

          <form action={deleteCustomer} className="mt-6 border-t border-white/10 pt-5">
            <input type="hidden" name="id" value={customer.id} />
            <button
              type="submit"
              disabled={accounts.length > 0}
              className="rounded-full border border-red-500/30 px-6 py-3 text-sm font-semibold text-red-300 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Delete customer
            </button>
            {accounts.length > 0 ? <p className="mt-2 text-xs text-slate-500">Customers with existing accounts cannot be deleted.</p> : null}
          </form>
        </div>
      </div>

      <div className="mt-8">
        <SectionTable
          title="Account history"
          columns={["Product", "Start", "Target", "Paid", "Balance", "Status"]}
          rows={accounts.map((a) => [a.productName, a.startDate, a.targetAmount, a.totalPaid, a.balance, a.status])}
        />
      </div>
    </DashboardShell>
  );
}
