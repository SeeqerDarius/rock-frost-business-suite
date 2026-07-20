import Link from "next/link";
import { Users, Target, Handshake, History } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireCurrentTenant } from "@/lib/tenant";
import { getCrmSummary } from "@/modules/crm/service";

export default async function CrmOverviewPage() {
  const tenant = await requireCurrentTenant();
  const summary = await getCrmSummary(tenant.organizationId);

  const stats = [
    { label: "Contacts", value: summary.contactCount, icon: Users, href: "/app/crm/contacts" },
    { label: "Open leads", value: summary.openLeadCount, icon: Target, href: "/app/crm/leads" },
    { label: "Open deals", value: summary.openDealCount, icon: Handshake, href: "/app/crm/deals" },
    { label: "Activity this month", value: summary.activityCountThisMonth, icon: History, href: "/app/crm/activities" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="CRM Overview" description="Contacts, leads, deals, and activity at a glance." />
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
