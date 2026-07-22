import Link from "next/link";
import { Users, PlayCircle, Wallet, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { getPayrollSummary } from "@/modules/payroll/service";

export default async function PayrollOverviewPage() {
  const tenant = await requireModuleAccess("payroll");
  const summary = await getPayrollSummary(tenant.organizationId);

  const stats = [
    { label: "Employees on payroll", value: summary.employeesWithCompensationCount, icon: Users, href: "/app/payroll/compensation" },
    { label: "Missing compensation", value: summary.employeesWithoutCompensationCount, icon: AlertTriangle, href: "/app/payroll/compensation" },
    { label: "Draft runs", value: summary.draftRunCount, icon: PlayCircle, href: "/app/payroll/runs" },
    { label: "Last run net pay", value: summary.lastRunTotalNet.toFixed(2), icon: Wallet, href: "/app/payroll/reports" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Payroll Overview" description="Compensation coverage, run status, and payroll cost at a glance." />
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
