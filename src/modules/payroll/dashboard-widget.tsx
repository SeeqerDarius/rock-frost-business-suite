import Link from "next/link";
import { Banknote } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { IconBadge } from "@/components/ui/icon-badge";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { getPayrollSummary } from "@/modules/payroll/service";

export async function PayrollDashboardWidget() {
  const tenant = await requireModuleAccess("payroll");
  const summary = await getPayrollSummary(tenant.organizationId);

  return (
    <Card>
      <CardHeader>
        <IconBadge size="lg"><Banknote className="size-5" /></IconBadge>
        <CardTitle className="mt-3">Payroll</CardTitle>
        <CardDescription>
          {summary.employeesWithCompensationCount} employee{summary.employeesWithCompensationCount === 1 ? "" : "s"} on payroll · {summary.draftRunCount} draft run{summary.draftRunCount === 1 ? "" : "s"} · last run net {summary.lastRunTotalNet.toFixed(2)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/app/payroll" />}>
          Open Payroll
        </Button>
      </CardContent>
    </Card>
  );
}
