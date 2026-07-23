import Link from "next/link";
import { Users, FileText, Wallet, Package, Lock } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireModuleAccess } from "@/lib/auth/module-access";
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
    { label: "Customers", value: customers.length, icon: Users, href: "/app/installment/customers" },
    { label: "Active accounts", value: activeCount, icon: FileText, href: "/app/installment/accounts" },
    ...(canManageProducts
      ? [{ label: "Products", value: products.length, icon: Package, href: "/app/installment/products" }]
      : []),
    { label: "Outstanding balance", value: outstandingBalance.toFixed(2), icon: Wallet, href: "/app/installment/accounts" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Installment Overview" description="Customer accounts, collections, and product performance at a glance." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardDescription>{stat.label}</CardDescription>
                <stat.icon className="size-4 text-muted-foreground" />
              </div>
              <CardTitle className="text-3xl">{stat.value}</CardTitle>
            </CardHeader>
            <CardContent>
              <Button size="sm" variant="outline" nativeButton={false} render={<Link href={stat.href as never} />}>
                View
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
