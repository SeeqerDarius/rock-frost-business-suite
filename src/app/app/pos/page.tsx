import Link from "next/link";
import { Store, ShoppingBag, ReceiptText, Undo2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { getPosSummary } from "@/modules/pos/service";

export default async function PosOverviewPage() {
  const tenant = await requireModuleAccess("pos");
  const summary = await getPosSummary(tenant.organizationId);

  const stats = [
    { label: "Open sessions", value: summary.openSessionCount, icon: Store, href: "/app/pos/registers" },
    { label: "Today's sales", value: `${summary.todaysSalesCount} (${summary.todaysSalesTotal.toFixed(2)})`, icon: ShoppingBag, href: "/app/pos/sell" },
    { label: "All-time sales", value: `${summary.allTimeSalesCount} (${summary.allTimeSalesTotal.toFixed(2)})`, icon: ReceiptText, href: "/app/pos/sales" },
    { label: "Refunded sales", value: summary.refundedCount, icon: Undo2, href: "/app/pos/sales" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="POS Overview" description="Registers, checkout activity, and same-day sales at a glance." />
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
