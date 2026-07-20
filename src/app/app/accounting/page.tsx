import Link from "next/link";
import { Wallet, FileText, Receipt, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireCurrentTenant } from "@/lib/tenant";
import { getAccountingSummary } from "@/modules/accounting/service";

export default async function AccountingOverviewPage() {
  const tenant = await requireCurrentTenant();
  const summary = await getAccountingSummary(tenant.organizationId);

  const stats = [
    { label: "Cash balance", value: summary.cashBalance.toFixed(2), icon: Wallet, href: "/app/accounting/accounts" },
    { label: "Outstanding invoices", value: summary.outstandingInvoiceCount, icon: FileText, href: "/app/accounting/invoices" },
    { label: "Pending expenses", value: summary.pendingExpenseCount, icon: Receipt, href: "/app/accounting/expenses" },
    { label: "Net income", value: summary.netIncome.toFixed(2), icon: TrendingUp, href: "/app/accounting/reports" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Accounting Overview" description="Cash position, receivables, payables, and profitability at a glance." />
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
