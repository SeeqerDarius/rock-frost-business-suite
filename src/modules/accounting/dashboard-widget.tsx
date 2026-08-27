import Link from "next/link";
import { Calculator } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { IconBadge } from "@/components/ui/icon-badge";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { formatMoney } from "@/lib/currency";
import { getAccountingSummary } from "@/modules/accounting/service";

export async function AccountingDashboardWidget({ linkable = true }: { linkable?: boolean } = {}) {
  const tenant = await requireModuleAccess("accounting");
  const summary = await getAccountingSummary(tenant.organizationId);

  return (
    <Card>
      <CardHeader>
        <IconBadge size="lg"><Calculator className="size-5" /></IconBadge>
        <CardTitle className="mt-3">Accounting</CardTitle>
        <CardDescription>
          {formatMoney(summary.cashBalance, tenant.organization.currency)} cash · {summary.outstandingInvoiceCount} outstanding invoice{summary.outstandingInvoiceCount === 1 ? "" : "s"} · {formatMoney(summary.netIncome, tenant.organization.currency)} net income
        </CardDescription>
      </CardHeader>
      {linkable ? (
        <CardContent>
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/app/accounting" />}>
            Open Accounting
          </Button>
        </CardContent>
      ) : null}
    </Card>
  );
}
