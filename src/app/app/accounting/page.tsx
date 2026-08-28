import { Wallet, FileText, Receipt, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { OverviewMetricCard } from "@/components/dashboard/overview-metric-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/feedback/empty-state";
import { TrendAreaChart, BreakdownDonutChart } from "@/components/dashboard/charts";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { formatMoney } from "@/lib/currency";
import { getAccountingSummary, getAccountingOverviewTrends } from "@/modules/accounting/service";

export default async function AccountingOverviewPage() {
  const tenant = await requireModuleAccess("accounting");
  const [summary, trends] = await Promise.all([
    getAccountingSummary(tenant.organizationId),
    getAccountingOverviewTrends(tenant.organizationId),
  ]);
  const currency = tenant.organization.currency;
  const money = (value: number) => formatMoney(value, currency);

  const stats = [
    { label: "Cash balance", value: money(summary.cashBalance), description: "Combined balance across cash accounts", icon: <Wallet className="size-4" />, href: "/app/accounting/accounts" },
    { label: "Outstanding invoices", value: summary.outstandingInvoiceCount, description: "Invoices awaiting customer payment", icon: <FileText className="size-4" />, href: "/app/accounting/invoices" },
    { label: "Pending expenses", value: summary.pendingExpenseCount, description: "Expenses awaiting approval or payment", icon: <Receipt className="size-4" />, href: "/app/accounting/expenses" },
    { label: "Net income", value: money(summary.netIncome), description: "Revenue less expenses for the period", icon: <TrendingUp className="size-4" />, href: "/app/accounting/reports" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Accounting Overview" description="Cash position, receivables, payables, and profitability at a glance." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => <OverviewMetricCard key={stat.label} {...stat} />)}
      </div>

      <Card>
        <CardHeader><CardTitle>Trends</CardTitle></CardHeader>
        <CardContent>
          <Tabs defaultValue="invoices">
            <TabsList variant="line">
              <TabsTrigger value="invoices">Invoices</TabsTrigger>
              <TabsTrigger value="profit-loss">Profit &amp; Loss</TabsTrigger>
              <TabsTrigger value="recent">Recent Invoices</TabsTrigger>
              <TabsTrigger value="overdue">Overdue Invoices</TabsTrigger>
            </TabsList>

            <TabsContent value="invoices" className="mt-6 grid gap-8 lg:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">Invoiced, last 6 months</p>
                <TrendAreaChart data={trends.monthly} series={[{ key: "invoiced", label: "Invoiced" }]} valueFormatter={money} />
              </div>
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">By status</p>
                <BreakdownDonutChart data={trends.invoiceStatusBreakdown} />
              </div>
            </TabsContent>

            <TabsContent value="profit-loss" className="mt-6">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Invoiced vs. expenses, last 6 months</p>
              <TrendAreaChart
                data={trends.monthly}
                series={[{ key: "invoiced", label: "Invoiced" }, { key: "expenses", label: "Expenses" }]}
                valueFormatter={money}
              />
            </TabsContent>

            <TabsContent value="recent" className="mt-6">
              {trends.recentInvoices.length === 0 ? (
                <EmptyState icon={FileText} title="No invoices yet" description="Invoices you create will show up here." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trends.recentInvoices.map((invoice) => (
                      <TableRow key={invoice.id}>
                        <TableCell>{invoice.invoiceNumber}</TableCell>
                        <TableCell>{invoice.customerName}</TableCell>
                        <TableCell>{money(invoice.amount)}</TableCell>
                        <TableCell><Badge variant="outline">{invoice.status}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            <TabsContent value="overdue" className="mt-6">
              {trends.overdueInvoices.length === 0 ? (
                <EmptyState icon={FileText} title="No overdue invoices" description="Every invoice is within its due date." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Amount due</TableHead>
                      <TableHead>Due date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trends.overdueInvoices.map((invoice) => (
                      <TableRow key={invoice.id}>
                        <TableCell>{invoice.invoiceNumber}</TableCell>
                        <TableCell>{invoice.customerName}</TableCell>
                        <TableCell>{money(invoice.amountDue)}</TableCell>
                        <TableCell>{invoice.dueDate.toLocaleDateString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
