import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { getStaff } from "@/lib/hire-purchase";
import { requirePermission, PERMISSIONS } from "@/lib/permissions";
import { createCustomer } from "@/lib/hire-purchase/actions/customers";

const field = "w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/15";
const label = "block text-sm text-slate-300";

export default async function NewCustomerPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const tenant = await requirePermission(PERMISSIONS.HIREPURCHASE_CUSTOMERS_MANAGE);
  const { error } = await searchParams;
  const isManagerTier = tenant.role === "Hire Purchase Manager" || tenant.role === "Organization Owner" || tenant.role === "Super Admin";
  const staff = isManagerTier ? await getStaff(tenant.organizationId) : [];

  return (
    <DashboardShell title="New customer" subtitle="Register a customer before opening their first installment account.">
      <div className="glass-card mx-auto max-w-2xl rounded-3xl border border-white/10 p-8">
        {error ? (
          <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {decodeURIComponent(error)}
          </div>
        ) : null}
        <form action={createCustomer} className="space-y-5">
          <label className={label}>
            <span className="mb-2 inline-block">Full name</span>
            <input name="fullName" required className={field} placeholder="Customer full name" />
          </label>
          <label className={label}>
            <span className="mb-2 inline-block">Phone</span>
            <input name="phone" className={field} placeholder="0XX XXX XXXX" />
          </label>
          <label className={label}>
            <span className="mb-2 inline-block">Address</span>
            <input name="address" className={field} placeholder="Residential address" />
          </label>
          <label className={label}>
            <span className="mb-2 inline-block">National ID</span>
            <input name="nationalId" className={field} placeholder="Ghana Card / ID number" />
          </label>
          {isManagerTier ? (
            <label className={label}>
              <span className="mb-2 inline-block">Assign to staff</span>
              <select name="staffId" required className={field}>
                <option value="">Select staff member</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.fullName} ({s.code})
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <button
            type="submit"
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-cyan-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
          >
            Register customer
          </button>
        </form>
      </div>
    </DashboardShell>
  );
}
