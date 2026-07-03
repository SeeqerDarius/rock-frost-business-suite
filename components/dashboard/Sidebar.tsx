import Link from "next/link";

const navigation = [
  { href: "/dashboard", label: "Dashboard", icon: "📈" },
  { href: "/fleet", label: "Fleet Overview", icon: "🚚" },
  { href: "/fleet/vehicles", label: "Vehicles", icon: "🛻" },
  { href: "/fleet/vehicle-owners", label: "Vehicle Owners", icon: "👥" },
  { href: "/fleet/drivers", label: "Drivers", icon: "🧑‍✈️" },
  { href: "/fleet/insurance-roadworthy", label: "Insurance & Roadworthy", icon: "🛡️" },
  { href: "/fleet/maintenance", label: "Maintenance", icon: "🔧" },
  { href: "/fleet/work-and-pay", label: "Work & Pay", icon: "💼" },
  { href: "/fleet/payments", label: "Payments", icon: "💳" },
  { href: "/fleet/reports", label: "Reports", icon: "📊" },
  { href: "/fleet/investor-dashboard", label: "Investor Dashboard", icon: "💎" },
  { href: "/fleet/settings", label: "Settings", icon: "⚙️" },
];

export function Sidebar() {
  return (
    <aside className="w-full border-b border-white/10 bg-[#03050b]/95 lg:sticky lg:top-0 lg:h-screen lg:w-72 lg:border-r lg:border-b-0 lg:bg-[#040811]/95">
      <div className="mx-auto flex max-w-[25rem] flex-col gap-8 px-5 py-8 lg:mx-0 lg:max-w-none">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-3 rounded-3xl border border-blue-500/15 bg-white/5 px-4 py-3 text-sm text-slate-200 shadow-sm shadow-blue-500/5">
            <span className="text-lg">❄️</span>
            <span className="font-semibold text-slate-100">Rock Frost Suite</span>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-cyan-200/70">Fleet & Asset Management</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              SaaS-ready fleet operations for multi-company asset management.
            </p>
          </div>
        </div>

        <nav className="space-y-1">
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href as any}
              className="flex items-center gap-3 rounded-3xl px-4 py-3 text-sm font-medium text-slate-200 transition hover:bg-white/5 hover:text-white"
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="mt-auto rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
          <p className="font-semibold text-slate-100">Organization-ready</p>
          <p className="mt-2 text-xs leading-5 text-slate-400">
            Designed for multiple businesses and tenants with neutral brand language.
          </p>
        </div>
      </div>
    </aside>
  );
}
