import Link from "next/link";
import { Contact } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { IconBadge } from "@/components/ui/icon-badge";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { getCrmSummary } from "@/modules/crm/service";

export async function CrmDashboardWidget({ linkable = true }: { linkable?: boolean } = {}) {
  const tenant = await requireModuleAccess("crm");
  const summary = await getCrmSummary(tenant.organizationId);

  return (
    <Card>
      <CardHeader>
        <IconBadge size="lg"><Contact className="size-5" /></IconBadge>
        <CardTitle className="mt-3">Customer Relationship Management</CardTitle>
        <CardDescription>
          {summary.contactCount} contact{summary.contactCount === 1 ? "" : "s"} · {summary.openDealCount} open deal{summary.openDealCount === 1 ? "" : "s"} · {summary.pipelineValue.toFixed(2)} pipeline
        </CardDescription>
      </CardHeader>
      {linkable ? (
        <CardContent>
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/app/crm" />}>
            Open CRM
          </Button>
        </CardContent>
      ) : null}
    </Card>
  );
}
