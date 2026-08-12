import Link from "next/link";
import { Lock, Wallet } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { IconBadge } from "@/components/ui/icon-badge";
import { EmptyState } from "@/components/feedback/empty-state";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { resolveInstallmentAccessScope } from "@/modules/installment/access";
import { listAccounts, listCustomers, getEffectiveAccountStatus } from "@/modules/installment/service";

export async function InstallmentDashboardWidget() {
  const tenant = await requireModuleAccess("installment");
  if (!hasPermission(tenant, PERMISSIONS.HIREPURCHASE_VIEW)) return null;

  const scope = await resolveInstallmentAccessScope(tenant);
  if (scope.kind === "denied") {
    return (
      <Card>
        <CardContent className="pt-6">
          <EmptyState
            icon={Lock}
            title="Staff access needs setup"
            description="Ask an administrator to link your login to one active installment staff profile before you continue."
            className="py-8"
          />
        </CardContent>
      </Card>
    );
  }

  const [accounts, customers] = await Promise.all([
    listAccounts(tenant.organizationId, scope),
    listCustomers(tenant.organizationId, scope),
  ]);

  const now = new Date();
  const activeCount = accounts.filter((a) => ["ACTIVE", "OVERDUE"].includes(getEffectiveAccountStatus(a, now))).length;

  return (
    <Card>
      <CardHeader>
        <IconBadge size="lg"><Wallet className="size-5" /></IconBadge>
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
