import { notFound } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { SectionTable } from "@/components/fleet/SectionTable";
import { db } from "@/lib/db";
import { requirePermission, PERMISSIONS } from "@/lib/permissions";
import { updateStaff, toggleStaffActive, recordStaffSalary } from "@/lib/hire-purchase/actions/staff";
import { adjustStaffInventory } from "@/lib/hire-purchase/actions/staff-inventory";

const field = "w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/15";
const label = "block text-sm text-slate-300";

function money(value: unknown) {
  const n = typeof value === "number" ? value : Number(value);
  return `GHS ${n.toLocaleString("en-US")}`;
}

export default async function StaffDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; updated?: string; inventory?: string }>;
}) {
  const tenant = await requirePermission(PERMISSIONS.HIREPURCHASE_STAFF_MANAGE);
  const { id } = await params;
  const { error, updated, inventory } = await searchParams;

  const staff = await db.hirePurchaseStaff.findFirst({
    where: { id, organizationId: tenant.organizationId },
    include: {
      salaryPayments: { orderBy: { paymentDate: "desc" }, take: 12 },
      inventory: { include: { product: { select: { name: true } } } },
    },
  });
  if (!staff) notFound();

  const products = await db.hirePurchaseProduct.findMany({ where: { organizationId: tenant.organizationId, active: true }, select: { id: true, name: true } });
  const today = new Date().toISOString().slice(0, 10);
  const currentMonth = today.slice(0, 7);

  return (
    <DashboardShell title={staff.fullName} subtitle={`Staff code ${staff.code} · ${staff.active ? "Active" : "Inactive"}`}>
      {error ? <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{decodeURIComponent(error)}</div> : null}
      {(updated || inventory) ? <div className="mb-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">Saved.</div> : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="glass-card rounded-3xl border border-white/10 p-6">
          <h3 className="text-lg font-semibold text-white">Profile</h3>
          <form action={updateStaff} className="mt-5 space-y-4">
            <input type="hidden" name="id" value={staff.id} />
            <label className={label}>
              <span className="mb-2 inline-block">Full name</span>
              <input name="fullName" defaultValue={staff.fullName} required className={field} />
            </label>
            <label className={label}>
              <span className="mb-2 inline-block">Email</span>
              <input name="email" type="email" defaultValue={staff.email ?? ""} className={field} />
            </label>
            <label className={label}>
              <span className="mb-2 inline-block">Phone</span>
              <input name="phone" defaultValue={staff.phone ?? ""} className={field} />
            </label>
            <label className={label}>
              <span className="mb-2 inline-block">Monthly salary</span>
              <input name="monthlySalary" type="number" min="0" step="0.01" defaultValue={String(staff.monthlySalary)} className={field} />
            </label>
            <button type="submit" className="rounded-full bg-cyan-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400">
              Save changes
            </button>
          </form>

          <form action={toggleStaffActive} className="mt-6 border-t border-white/10 pt-5">
            <input type="hidden" name="id" value={staff.id} />
            <button type="submit" className="rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-slate-100 transition hover:bg-white/10">
              {staff.active ? "Deactivate staff" : "Reactivate staff"}
            </button>
          </form>
        </div>

        <div className="glass-card rounded-3xl border border-white/10 p-6">
          <h3 className="text-lg font-semibold text-white">Record salary payment</h3>
          <form action={recordStaffSalary} className="mt-5 space-y-4">
            <input type="hidden" name="staffId" value={staff.id} />
            <label className={label}>
              <span className="mb-2 inline-block">Amount</span>
              <input name="amount" type="number" min="0.01" step="0.01" required className={field} />
            </label>
            <label className={label}>
              <span className="mb-2 inline-block">Payment date</span>
              <input name="paymentDate" type="date" max={today} defaultValue={today} required className={field} />
            </label>
            <label className={label}>
              <span className="mb-2 inline-block">Salary month</span>
              <input name="salaryMonth" type="month" defaultValue={currentMonth} required className={field} />
            </label>
            <label className={label}>
              <span className="mb-2 inline-block">Notes</span>
              <input name="notes" className={field} />
            </label>
            <button type="submit" className="rounded-full bg-cyan-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400">
              Record payment
            </button>
          </form>
        </div>
      </div>

      <div className="mt-8 glass-card rounded-3xl border border-white/10 p-6">
        <h3 className="text-lg font-semibold text-white">Adjust inventory</h3>
        <form action={adjustStaffInventory} className="mt-5 grid gap-4 sm:grid-cols-3">
          <input type="hidden" name="staffId" value={staff.id} />
          <label className={label}>
            <span className="mb-2 inline-block">Product</span>
            <select name="productId" required className={field}>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
          <label className={label}>
            <span className="mb-2 inline-block">Quantity change</span>
            <input name="quantityChange" type="number" step="1" required placeholder="e.g. 5 or -2" className={field} />
          </label>
          <div className="flex items-end">
            <button type="submit" className="w-full rounded-full bg-cyan-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400">
              Apply
            </button>
          </div>
        </form>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <SectionTable
          title="Current inventory"
          columns={["Product", "Quantity"]}
          rows={staff.inventory.map((i) => [i.product.name, String(i.quantity)])}
        />
        <SectionTable
          title="Recent salary payments"
          columns={["Date", "Salary month", "Amount", "Notes"]}
          rows={staff.salaryPayments.map((p) => [
            p.paymentDate.toISOString().slice(0, 10),
            p.salaryMonth.toISOString().slice(0, 7),
            money(p.amount),
            p.notes ?? "—",
          ])}
        />
      </div>
    </DashboardShell>
  );
}
