import Link from "next/link";
import { getCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS, type PermissionKey } from "@/lib/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import { getUnreadNotificationCount } from "@/lib/notifications";

type NavItem = { href: string; label: string; icon: string; permission: PermissionKey };

const generalNavigation: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "📈", permission: PERMISSIONS.DASHBOARD_VIEW },
  { href: "/notifications", label: "Notifications", icon: "🔔", permission: PERMISSIONS.DASHBOARD_VIEW },
  { href: "/assistant", label: "AI Assistant", icon: "✨", permission: PERMISSIONS.AI_ASSISTANT_USE },
];

const navigationSections: { title: string; items: NavItem[] }[] = [
  {
    title: "Fleet & Asset Management",
    items: [
      { href: "/fleet", label: "Fleet Overview", icon: "🚚", permission: PERMISSIONS.FLEET_VIEW },
      { href: "/fleet/vehicles", label: "Vehicles", icon: "🛻", permission: PERMISSIONS.FLEET_VEHICLES_MANAGE },
      { href: "/fleet/vehicle-owners", label: "Vehicle Owners", icon: "👥", permission: PERMISSIONS.FLEET_OWNERS_MANAGE },
      { href: "/fleet/drivers", label: "Drivers", icon: "🧑‍✈️", permission: PERMISSIONS.FLEET_DRIVERS_MANAGE },
      { href: "/fleet/insurance-roadworthy", label: "Insurance & Roadworthy", icon: "🛡️", permission: PERMISSIONS.FLEET_INSURANCE_MANAGE },
      { href: "/fleet/maintenance", label: "Maintenance", icon: "🔧", permission: PERMISSIONS.FLEET_MAINTENANCE_MANAGE },
      { href: "/fleet/work-and-pay", label: "Work & Pay", icon: "💼", permission: PERMISSIONS.FLEET_WORKANDPAY_MANAGE },
      { href: "/fleet/payments", label: "Payments", icon: "💳", permission: PERMISSIONS.FLEET_PAYMENTS_MANAGE },
      { href: "/fleet/reports", label: "Reports", icon: "📊", permission: PERMISSIONS.FLEET_REPORTS_VIEW },
      { href: "/fleet/investor-dashboard", label: "Investor Dashboard", icon: "💎", permission: PERMISSIONS.FLEET_INVESTOR_VIEW },
      { href: "/fleet/settings", label: "Settings", icon: "⚙️", permission: PERMISSIONS.ORG_SETTINGS_MANAGE },
    ],
  },
  {
    title: "Hire Purchase",
    items: [
      { href: "/hire-purchase", label: "Overview", icon: "🧾", permission: PERMISSIONS.HIREPURCHASE_VIEW },
      { href: "/hire-purchase/customers", label: "Customers", icon: "🧑‍🤝‍🧑", permission: PERMISSIONS.HIREPURCHASE_CUSTOMERS_MANAGE },
      { href: "/hire-purchase/accounts", label: "Accounts", icon: "📄", permission: PERMISSIONS.HIREPURCHASE_ACCOUNTS_MANAGE },
      { href: "/hire-purchase/payments", label: "Payments", icon: "💵", permission: PERMISSIONS.HIREPURCHASE_PAYMENTS_MANAGE },
      { href: "/hire-purchase/products", label: "Products", icon: "📦", permission: PERMISSIONS.HIREPURCHASE_PRODUCTS_MANAGE },
      { href: "/hire-purchase/staff", label: "Staff", icon: "🧑‍💼", permission: PERMISSIONS.HIREPURCHASE_STAFF_MANAGE },
      { href: "/hire-purchase/credits", label: "Credits", icon: "💳", permission: PERMISSIONS.HIREPURCHASE_CREDITS_MANAGE },
      { href: "/hire-purchase/reports", label: "Reports", icon: "📊", permission: PERMISSIONS.HIREPURCHASE_REPORTS_VIEW },
      { href: "/hire-purchase/settings", label: "Settings", icon: "🛠️", permission: PERMISSIONS.HIREPURCHASE_SETTINGS_MANAGE },
    ],
  },
];

function NavLink({ item, unreadCount }: { item: NavItem; unreadCount: number }) {
  return (
    <Link
      href={item.href as any}
      className="flex items-center gap-3 rounded-3xl px-4 py-3 text-sm font-medium text-slate-200 transition hover:bg-white/5 hover:text-white"
    >
      <span>{item.icon}</span>
      <span>{item.label}</span>
      {item.href === "/notifications" && unreadCount > 0 ? (
        <span className="ml-auto rounded-full bg-cyan-500 px-2 py-0.5 text-xs font-semibold text-slate-950">
          {unreadCount}
        </span>
      ) : null}
    </Link>
  );
}

export async function Sidebar() {
  const tenant = await getCurrentTenant();
  const visibleGeneral = generalNavigation.filter((item) => hasPermission(tenant, item.permission));
  const visibleSections = navigationSections
    .map((section) => ({ ...section, items: section.items.filter((item) => hasPermission(tenant, item.permission)) }))
    .filter((section) => section.items.length > 0);

  const session = await getServerAuthSession();
  const unreadCount =
    tenant && session?.user?.id ? await getUnreadNotificationCount(tenant.organizationId, session.user.id) : 0;

  return (
    <aside className="w-full border-b border-white/10 bg-[#03050b]/95 lg:sticky lg:top-0 lg:h-screen lg:w-72 lg:border-r lg:border-b-0 lg:bg-[#040811]/95">
      <div className="mx-auto flex max-w-[25rem] flex-col gap-8 px-5 py-8 lg:mx-0 lg:max-w-none">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-3 rounded-3xl border border-blue-500/15 bg-white/5 px-4 py-3 text-sm text-slate-200 shadow-sm shadow-blue-500/5">
            <span className="text-lg">❄️</span>
            <span className="font-semibold text-slate-100">Rock Frost Suite</span>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-cyan-200/70">Multi-Module Business Suite</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              SaaS-ready operations across every module your organization has enabled.
            </p>
          </div>
        </div>

        <nav className="space-y-6">
          <div className="space-y-1">
            {visibleGeneral.map((item) => (
              <NavLink key={item.href} item={item} unreadCount={unreadCount} />
            ))}
          </div>

          {visibleSections.map((section) => (
            <div key={section.title} className="space-y-1">
              <p className="px-4 text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">{section.title}</p>
              {section.items.map((item) => (
                <NavLink key={item.href} item={item} unreadCount={unreadCount} />
              ))}
            </div>
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
