import { Lock } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/feedback/empty-state";
import { installmentNavigation } from "@/modules/installment/navigation";
import { requireCurrentTenant } from "@/lib/tenant";
import { canAccessModule, hasPermission, PERMISSIONS } from "@/lib/auth/permissions";

export default async function InstallmentLayout({ children }: { children: React.ReactNode }) {
  const tenant = await requireCurrentTenant();

  if (!canAccessModule(tenant, "installment")) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <EmptyState
          icon={Lock}
          title="Installment Management isn't available to you"
          description="Either your organization hasn't enabled this module, or your role doesn't include Installment access. Contact an administrator if you believe this is a mistake."
        />
      </div>
    );
  }

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
  const navigation = installmentNavigation.filter((item) => canOpen.get(item.href) === true);

  return (
    <AppShell
      sectionLabel="Installment Management"
      moduleKey="installment"
      navigation={navigation}
      enabledModuleKeys={tenant.accessibleModuleKeys}
      organization={{ organizationId: tenant.organizationId, memberships: tenant.memberships }}
    >
      {children}
    </AppShell>
  );
}
