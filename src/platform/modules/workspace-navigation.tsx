import { LayoutGrid, Grid3x3, BarChart3, Bell, Building2, ShieldCheck, MessageSquarePlus, CreditCard, LifeBuoy } from "lucide-react";
import type { ModuleNavItem } from "@/types/module";
import type { TenantContext } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getTenantUnreadCount } from "@/lib/support/service";

/**
 * Top-level workspace navigation — organization scope, not tied to any one
 * module. Filtered by the current tenant's permissions rather than a static
 * array: Administration and Organization both require org.settings.manage,
 * so a role like Fleet Manager or Hire Purchase Manager never sees links to
 * pages it would be blocked from anyway.
 */
export async function getWorkspaceNavigation(tenant: TenantContext): Promise<ModuleNavItem[]> {
  const unreadSupportCount = await getTenantUnreadCount(tenant.organizationId);
  const items: ModuleNavItem[] = [
    { label: "Overview", href: "/app/dashboard", icon: <LayoutGrid className="size-4" /> },
    { label: "Modules", href: "/app/modules", icon: <Grid3x3 className="size-4" /> },
    { label: "Reports", href: "/app/reports", icon: <BarChart3 className="size-4" /> },
    { label: "Notifications", href: "/app/notifications", icon: <Bell className="size-4" /> },
    { label: unreadSupportCount > 0 ? `Support (${unreadSupportCount})` : "Support", href: "/app/support", icon: <LifeBuoy className="size-4" /> },
  ];

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
