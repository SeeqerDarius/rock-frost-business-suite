import { LayoutGrid, Blocks, BarChart3, Bell, Building2, ShieldCheck, MessageSquarePlus, CreditCard } from "lucide-react";
import type { ModuleNavItem } from "@/types/module";
import type { TenantContext } from "@/lib/tenant";
import { hasPermission, isFleetDriverRole, PERMISSIONS } from "@/lib/auth/permissions";

/**
 * Top-level workspace navigation — organization scope, not tied to any one
 * module. Filtered by the current tenant's permissions rather than a static
 * array: Administration and Organization both require org.settings.manage,
 * so a role like Fleet Manager or Hire Purchase Manager never sees links to
 * pages it would be blocked from anyway.
 *
 * Support is deliberately not listed here — it's reachable everywhere in the
 * tenant workspace via the floating chat bubble (src/app/app/layout.tsx),
 * not a sidebar destination. See docs/SUPPORT_MESSAGING.md.
 *
 * "Modules" is the icon-tile launcher, distinct from Overview: Overview's
 * own "Quick launch" icon grid and its cards' "Open X" buttons were both
 * removed, so Overview is summary-only. Modules carries the launcher job
 * instead - the same icon-tile grid Quick launch used to show on Overview,
 * each tile a real link that opens its module.
 */
export async function getWorkspaceNavigation(tenant: TenantContext): Promise<ModuleNavItem[]> {
  const items: ModuleNavItem[] = [
    { label: "Overview", href: "/app/dashboard", icon: <LayoutGrid className="size-4" /> },
  ];

  // Modules and Reports both require organization-wide context a Driver
  // never has - /app/modules and /app/reports already redirect the Driver
  // role straight back to /app/dashboard (see those pages' own
  // isFleetDriverRole checks), so showing either link here was previously a
  // dead click, not a real destination.
  if (!isFleetDriverRole(tenant)) {
    items.push(
      { label: "Modules", href: "/app/modules", icon: <Blocks className="size-4" /> },
      { label: "Reports", href: "/app/reports", icon: <BarChart3 className="size-4" /> },
    );
  }

  items.push({ label: "Notifications", href: "/app/notifications", icon: <Bell className="size-4" /> });

  if (hasPermission(tenant, PERMISSIONS.ORG_SETTINGS_MANAGE)) {
    items.push(
      { label: "Module Requests", href: "/app/module-requests", icon: <MessageSquarePlus className="size-4" /> },
      { label: "Organization", href: "/app/organization", icon: <Building2 className="size-4" /> },
      { label: "Billing", href: "/app/organization/billing", icon: <CreditCard className="size-4" /> },
      { label: "Administration", href: "/app/administration", icon: <ShieldCheck className="size-4" /> }
    );
  }

  return items;
}
