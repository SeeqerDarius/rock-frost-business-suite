import type { TenantContext } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import type { ModuleNavItem } from "@/types/module";
import { installmentNavigation } from "@/modules/installment/navigation";

/**
 * The single source of truth for which Installment pages the current
 * tenant can open, by permission - both Installment's own layout.tsx and
 * the sidebar's cross-module accordion
 * (src/platform/modules/full-navigation.tsx) call this, so a role's real
 * page access can never drift between the two.
 *
 * Deliberately a separate file from src/modules/installment/navigation.tsx
 * (which only holds the plain installmentNavigation array) - see the
 * matching comment in src/modules/fleet/navigation-access.ts for why:
 * navigation.tsx is imported by registry.ts, which reaches the client
 * component AppShell, and `@/lib/auth/permissions` starts with
 * `import "server-only"`.
 */
export function getInstallmentNavigationForTenant(tenant: TenantContext): ModuleNavItem[] {
  const canOpen = new Map<string, boolean>([
    ["/app/installment", hasPermission(tenant, PERMISSIONS.HIREPURCHASE_VIEW)],
    ["/app/installment/customers", hasPermission(tenant, PERMISSIONS.HIREPURCHASE_CUSTOMERS_MANAGE)],
    ["/app/installment/products", hasPermission(tenant, PERMISSIONS.HIREPURCHASE_PRODUCTS_MANAGE)],
    ["/app/installment/accounts", hasPermission(tenant, PERMISSIONS.HIREPURCHASE_ACCOUNTS_MANAGE)],
    [
      "/app/installment/payments",
      hasPermission(tenant, PERMISSIONS.HIREPURCHASE_PAYMENTS_MANAGE) ||
        hasPermission(tenant, PERMISSIONS.HIREPURCHASE_CREDITS_MANAGE),
    ],
    ["/app/installment/collections", hasPermission(tenant, PERMISSIONS.HIREPURCHASE_VIEW)],
    ["/app/installment/staff", hasPermission(tenant, PERMISSIONS.HIREPURCHASE_STAFF_MANAGE)],
    ["/app/installment/reports", hasPermission(tenant, PERMISSIONS.HIREPURCHASE_REPORTS_VIEW)],
    ["/app/installment/settings", hasPermission(tenant, PERMISSIONS.HIREPURCHASE_SETTINGS_MANAGE)],
  ]);
  return installmentNavigation.filter((item) => canOpen.get(item.href) === true);
}
