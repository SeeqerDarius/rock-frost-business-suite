import { notFound } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { db } from "@/lib/db";
import { getProductCategories } from "@/lib/hire-purchase";
import { requirePermission, PERMISSIONS } from "@/lib/permissions";
import { updateProduct, deleteProduct } from "@/lib/hire-purchase/actions/products";

const field = "w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/15";
const label = "block text-sm text-slate-300";

export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const tenant = await requirePermission(PERMISSIONS.HIREPURCHASE_PRODUCTS_MANAGE);
  const { id } = await params;
  const { error } = await searchParams;

  const [product, categories] = await Promise.all([
    db.hirePurchaseProduct.findFirst({ where: { id, organizationId: tenant.organizationId }, include: { _count: { select: { accounts: true } } } }),
    getProductCategories(tenant.organizationId),
  ]);
  if (!product) notFound();

  return (
    <DashboardShell title={product.name} subtitle={`${product._count.accounts} account(s) opened against this product.`}>
      {error ? (
        <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{decodeURIComponent(error)}</div>
      ) : null}

      <div className="glass-card mx-auto max-w-2xl rounded-3xl border border-white/10 p-8">
        <form action={updateProduct} className="space-y-5">
          <input type="hidden" name="id" value={product.id} />
          <label className={label}>
            <span className="mb-2 inline-block">Name</span>
            <input name="name" defaultValue={product.name} required className={field} />
          </label>
          <label className={label}>
            <span className="mb-2 inline-block">Category</span>
            <input name="category" defaultValue={product.category} list="categories" required className={field} />
            <datalist id="categories">
              {categories.map((c) => (
                <option key={c.id} value={c.name} />
              ))}
            </datalist>
          </label>
          <label className={label}>
            <span className="mb-2 inline-block">Description</span>
            <textarea name="description" rows={3} defaultValue={product.description ?? ""} className={field} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={label}>
              <span className="mb-2 inline-block">Cost price</span>
              <input name="costPrice" type="number" min="0.01" step="0.01" defaultValue={String(product.costPrice)} required className={field} />
            </label>
            <label className={label}>
              <span className="mb-2 inline-block">Transport cost</span>
              <input name="transportCost" type="number" min="0" step="0.01" defaultValue={String(product.transportCost)} className={field} />
            </label>
            <label className={label}>
              <span className="mb-2 inline-block">Daily amount</span>
              <input name="dailyAmount" type="number" min="0.01" step="0.01" defaultValue={String(product.dailyAmount)} required className={field} />
            </label>
            <label className={label}>
              <span className="mb-2 inline-block">Duration (days)</span>
              <input name="duration" type="number" min="1" step="1" defaultValue={product.duration} required className={field} />
            </label>
          </div>
          <label className="flex items-center gap-3 text-sm text-slate-300">
            <input name="active" type="checkbox" defaultChecked={product.active} className="h-4 w-4 rounded border-white/20 bg-white/5" />
            Active (available for new accounts)
          </label>
          <button type="submit" className="w-full rounded-full bg-cyan-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400">
            Save changes
          </button>
        </form>

        <form action={deleteProduct} className="mt-6 border-t border-white/10 pt-5">
          <input type="hidden" name="id" value={product.id} />
          <button
            type="submit"
            disabled={product._count.accounts > 0}
            className="rounded-full border border-red-500/30 px-6 py-3 text-sm font-semibold text-red-300 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Delete product
          </button>
          {product._count.accounts > 0 ? <p className="mt-2 text-xs text-slate-500">Products with existing accounts cannot be deleted.</p> : null}
        </form>
      </div>
    </DashboardShell>
  );
}
