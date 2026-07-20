import Link from "next/link";
import { Users, FileText, Wallet, Package } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireCurrentTenant } from "@/lib/tenant";
import {
  listCustomers,
  listAccounts,
  listProducts,
  getEffectiveAccountStatus,
  resolveInstallmentStaffScope,
} from "@/modules/installment/service";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";

export default async function InstallmentOverviewPage() {
  const tenant = await requireCurrentTenant();
  const session = await getServerAuthSession();
  const isManager = hasPermission(tenant, PERMISSIONS.HIREPURCHASE_STAFF_MANAGE);
  const scope = await resolveInstallmentStaffScope(tenant.organizationId, session?.user?.id ?? "", isManager);

  const [customers, accounts, products] = await Promise.all([
    listCustomers(tenant.organizationId, scope.staffId),
    listAccounts(tenant.organizationId, scope.staffId),
    listProducts(tenant.organizationId),
  ]);

  const now = new Date();
  const activeCount = accounts.filter((a) => ["ACTIVE", "OVERDUE"].includes(getEffectiveAccountStatus(a, now))).length;
  const outstandingBalance = accounts.reduce((sum, a) => sum + Number(a.balance), 0);

  const stats = [
    { label: "Customers", value: customers.length, icon: Users, href: "/app/installment/customers" },
    { label: "Active accounts", value: activeCount, icon: FileText, href: "/app/installment/accounts" },
    { label: "Products", value: products.length, icon: Package, href: "/app/installment/products" },
    { label: "Outstanding balance", value: outstandingBalance.toFixed(2), icon: Wallet, href: "/app/installment/reports" },
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
