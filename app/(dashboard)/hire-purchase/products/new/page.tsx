import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { getProductCategories } from "@/lib/hire-purchase";
import { requirePermission, PERMISSIONS } from "@/lib/permissions";
import { createProduct } from "@/lib/hire-purchase/actions/products";

const field = "w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/15";
const label = "block text-sm text-slate-300";

export default async function NewProductPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const tenant = await requirePermission(PERMISSIONS.HIREPURCHASE_PRODUCTS_MANAGE);
  const { error } = await searchParams;
  const categories = await getProductCategories(tenant.organizationId);

  return (
    <DashboardShell title="New product" subtitle="Price is calculated automatically as daily amount × duration.">
      <div className="glass-card mx-auto max-w-2xl rounded-3xl border border-white/10 p-8">
        {error ? (
          <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{decodeURIComponent(error)}</div>
        ) : null}
        <form action={createProduct} className="space-y-5">
          <label className={label}>
            <span className="mb-2 inline-block">Name</span>
            <input name="name" required className={field} />
          </label>
          <label className={label}>
            <span className="mb-2 inline-block">Category</span>
            <input name="category" list="categories" required className={field} />
            <datalist id="categories">
              {categories.map((c) => (
                <option key={c.id} value={c.name} />
              ))}
            </datalist>
          </label>
          <label className={label}>
            <span className="mb-2 inline-block">Description</span>
            <textarea name="description" rows={3} className={field} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={label}>
              <span className="mb-2 inline-block">Cost price</span>
              <input name="costPrice" type="number" min="0.01" step="0.01" required className={field} />
            </label>
            <label className={label}>
              <span className="mb-2 inline-block">Transport cost</span>
              <input name="transportCost" type="number" min="0" step="0.01" defaultValue="0" className={field} />
            </label>
            <label className={label}>
              <span className="mb-2 inline-block">Daily amount</span>
              <input name="dailyAmount" type="number" min="0.01" step="0.01" required className={field} />
            </label>
            <label className={label}>
              <span className="mb-2 inline-block">Duration (days)</span>
              <input name="duration" type="number" min="1" step="1" required className={field} />
            </label>
          </div>
          <label className="flex items-center gap-3 text-sm text-slate-300">
            <input name="active" type="checkbox" defaultChecked className="h-4 w-4 rounded border-white/20 bg-white/5" />
            Active (available for new accounts)
          </label>
          <button
            type="submit"
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-cyan-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
          >
            Create product
          </button>
        </form>
      </div>
    </DashboardShell>
  );
}
