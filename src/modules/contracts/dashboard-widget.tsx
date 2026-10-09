import Link from "next/link";
import { FileSignature } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { IconBadge } from "@/components/ui/icon-badge";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { actorFromTenant, getContractDashboard } from "@/modules/contracts/service";

export async function ContractsDashboardWidget({ linkable = true }: { linkable?: boolean } = {}) {
  const tenant = await requireModuleAccess("contracts");
  const actor = actorFromTenant(tenant);
  if (!actor.permissions.length) return null;
  const summary = await getContractDashboard(actor);
  const active = summary.byStatus.ACTIVE ?? 0;

  return (
    <Card>
      <CardHeader>
        <IconBadge size="lg"><FileSignature className="size-5" /></IconBadge>
        <CardTitle className="mt-3">Contract Management</CardTitle>
        <CardDescription>
          {active} active contract{active === 1 ? "" : "s"} · {summary.expiring30} expiring in 30 days · {summary.renewalsRequiringDecision} renewal decision{summary.renewalsRequiringDecision === 1 ? "" : "s"} due
        </CardDescription>
      </CardHeader>
      {linkable ? (
        <CardContent>
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/app/contracts" />}>
            Open Contract Management
          </Button>
        </CardContent>
      ) : null}
    </Card>
  );
}
