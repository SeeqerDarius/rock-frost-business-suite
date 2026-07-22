import Link from "next/link";
import { Wallet } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import { listAccounts, listCustomers, getEffectiveAccountStatus, resolveInstallmentStaffScope } from "@/modules/installment/service";

export async function InstallmentDashboardWidget() {
  const tenant = await requireModuleAccess("installment");
  const session = await getServerAuthSession();
  const isManager = hasPermission(tenant, PERMISSIONS.HIREPURCHASE_STAFF_MANAGE);
  const scope = await resolveInstallmentStaffScope(tenant.organizationId, session?.user?.id ?? "", isManager);

  const [accounts, customers] = await Promise.all([
    listAccounts(tenant.organizationId, scope.staffId),
    listCustomers(tenant.organizationId, scope.staffId),
  ]);

  const now = new Date();
  const activeCount = accounts.filter((a) => ["ACTIVE", "OVERDUE"].includes(getEffectiveAccountStatus(a, now))).length;

  return (
    <Card>
      <CardHeader>
        <Wallet className="size-6 text-muted-foreground" />
        <CardTitle className="mt-3">Installment Management</CardTitle>
        <CardDescription>
          {customers.length} customer{customers.length === 1 ? "" : "s"} · {activeCount} active account{activeCount === 1 ? "" : "s"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/app/installment" />}>
          Open Installment Management
        </Button>
      </CardContent>
    </Card>
  );
}
