import Link from "next/link";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { SectionTable } from "@/components/fleet/SectionTable";
import { getProductCategories, getProducts } from "@/lib/hire-purchase";
import { requirePermission, PERMISSIONS } from "@/lib/permissions";
import { createProductCategory } from "@/lib/hire-purchase/actions/products";

const field = "w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/15";

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const tenant = await requirePermission(PERMISSIONS.HIREPURCHASE_PRODUCTS_MANAGE);
  const { category } = await searchParams;
  const [products, categories] = await Promise.all([getProducts(tenant.organizationId), getProductCategories(tenant.organizationId)]);

  return (
    <DashboardShell title="Products" subtitle="The catalog of items available for installment plans, with cost and pricing.">
      {category ? (
        <div className="mb-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">Category {category}.</div>
      ) : null}

      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <div className="glass-card rounded-3xl border border-white/10 p-6 lg:col-span-1">
          <h3 className="text-lg font-semibold text-white">Categories</h3>
          <ul className="mt-4 space-y-2 text-sm text-slate-300">
            {categories.map((c) => (
              <li key={c.id} className="flex justify-between rounded-2xl border border-white/5 bg-white/5 px-4 py-2">
                <span>{c.name}</span>
                <span className="text-slate-500">{c.productCount}</span>
              </li>
            ))}
            {categories.length === 0 ? <li className="text-slate-500">No categories yet.</li> : null}
          </ul>
          <form action={createProductCategory} className="mt-5 flex gap-2">
            <input name="name" required placeholder="New category" className={field} />
            <button type="submit" className="shrink-0 rounded-full bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400">Add</button>
          </form>
        </div>

        <div className="glass-card flex items-center justify-between rounded-3xl border border-white/10 p-6 lg:col-span-2">
          <div>
            <h3 className="text-lg font-semibold text-white">Product catalog</h3>
            <p className="mt-2 text-sm text-slate-400">{products.length} product(s) registered.</p>
          </div>
          <Link
            href="/hire-purchase/products/new"
            className="inline-flex items-center gap-2 rounded-full bg-cyan-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
          >
            + New product
          </Link>
        </div>
      </div>

      <SectionTable
        title="Products"
        columns={["Name", "Category", "Cost + transport", "Daily amount", "Duration", "Price", "Active"]}
        rows={products.map((p) => [p.name, p.category, p.landedCost, p.dailyAmount, `${p.duration}d`, p.price, p.active ? "Yes" : "No"])}
      />
    </DashboardShell>
  );
}
