import Link from "next/link";
import { Banknote } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireCurrentTenant } from "@/lib/tenant";
import { getPayrollSummary } from "@/modules/payroll/service";

export async function PayrollDashboardWidget() {
  const tenant = await requireCurrentTenant();
  const summary = await getPayrollSummary(tenant.organizationId);

  return (
    <Card>
      <CardHeader>
        <Banknote className="size-6 text-muted-foreground" />
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
