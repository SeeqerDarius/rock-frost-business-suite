import Link from "next/link";
import { Calculator } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireCurrentTenant } from "@/lib/tenant";
import { getAccountingSummary } from "@/modules/accounting/service";

export async function AccountingDashboardWidget() {
  const tenant = await requireCurrentTenant();
  const summary = await getAccountingSummary(tenant.organizationId);

  return (
    <Card>
      <CardHeader>
        <Calculator className="size-6 text-muted-foreground" />
        <CardTitle className="mt-3">Accounting</CardTitle>
        <CardDescription>
          {summary.cashBalance.toFixed(2)} cash · {summary.outstandingInvoiceCount} outstanding invoice{summary.outstandingInvoiceCount === 1 ? "" : "s"} · {summary.netIncome.toFixed(2)} net income
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/app/accounting" />}>
          Open Accounting
        </Button>
      </CardContent>
    </Card>
  );
}
