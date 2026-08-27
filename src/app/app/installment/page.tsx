import { Users, FileText, Wallet, Package, Lock } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { OverviewMetricCard } from "@/components/dashboard/overview-metric-card";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { formatMoney } from "@/lib/currency";
import {
  listCustomers,
  listAccounts,
  listProducts,
  getEffectiveAccountStatus,
} from "@/modules/installment/service";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { resolveInstallmentAccessScope } from "@/modules/installment/access";

export default async function InstallmentOverviewPage() {
  const tenant = await requireModuleAccess("installment");

  if (!hasPermission(tenant, PERMISSIONS.HIREPURCHASE_VIEW)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Installment Overview" description="Customer accounts, collections, and product performance at a glance." />
        <EmptyState icon={Lock} title="You don't have access to this page" description="The Installment overview is limited to roles with overview permissions." />
      </div>
    );
  }

  const scope = await resolveInstallmentAccessScope(tenant);
  if (scope.kind === "denied") {
    return (
      <div className="space-y-6">
        <PageHeader title="Installment Overview" description="Customer accounts, collections, and product performance at a glance." />
        <EmptyState
          icon={Lock}
          title="Staff access needs setup"
          description="Ask an administrator to link your login to one active installment staff profile before you continue."
        />
      </div>
    );
  }

  const canManageProducts = hasPermission(tenant, PERMISSIONS.HIREPURCHASE_PRODUCTS_MANAGE);
  const [customers, accounts, products] = await Promise.all([
    listCustomers(tenant.organizationId, scope),
    listAccounts(tenant.organizationId, scope),
    canManageProducts ? listProducts(tenant.organizationId) : Promise.resolve([]),
  ]);

  const now = new Date();
  const activeCount = accounts.filter((a) => ["ACTIVE", "OVERDUE"].includes(getEffectiveAccountStatus(a, now))).length;
  const outstandingBalance = accounts.reduce((sum, a) => sum + Number(a.balance), 0);

  const stats = [
    { label: "Customers", value: customers.length, description: "Customers with an installment profile", icon: <Users className="size-4" />, href: "/app/installment/customers" },
    { label: "Active accounts", value: activeCount, description: "Accounts currently active or overdue", icon: <FileText className="size-4" />, href: "/app/installment/accounts" },
    ...(canManageProducts
      ? [{ label: "Products", value: products.length, description: "Products available for installment sale", icon: <Package className="size-4" />, href: "/app/installment/products" }]
      : []),
    { label: "Outstanding balance", value: formatMoney(outstandingBalance, tenant.organization.currency), description: "Total balance still owed across accounts", icon: <Wallet className="size-4" />, href: "/app/installment/accounts" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Installment Overview" description="Customer accounts, collections, and product performance at a glance." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => <OverviewMetricCard key={stat.label} {...stat} />)}
      </div>
    </div>
  );
}
