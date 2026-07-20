import Link from "next/link";
import { FileText, PackageCheck, Wallet, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireCurrentTenant } from "@/lib/tenant";
import { getProcurementSummary } from "@/modules/procurement/service";

export default async function ProcurementOverviewPage() {
  const tenant = await requireCurrentTenant();
  const summary = await getProcurementSummary(tenant.organizationId);

  const stats = [
    { label: "Pending requests", value: summary.pendingRequestCount, icon: FileText, href: "/app/procurement/requests" },
    { label: "Open orders", value: summary.openOrderCount, icon: PackageCheck, href: "/app/procurement/orders" },
    { label: "Open order value", value: summary.openOrderValue.toFixed(2), icon: Wallet, href: "/app/procurement/orders" },
    { label: "Received orders", value: summary.receivedOrderCount, icon: CheckCircle2, href: "/app/procurement/orders" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Procurement Overview" description="Purchase requests, open orders, and vendor spend at a glance." />
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
