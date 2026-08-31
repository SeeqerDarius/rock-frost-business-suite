import { CalendarClock, Lock } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/currency";
import { getReceivablesAgeing, getPayablesAgeing } from "@/modules/accounting/service";
import { ReportDownloadLinks } from "@/components/reports/report-download-links";

const BUCKET_HEADERS = ["Current", "1-30 days", "31-60 days", "61-90 days", "90+ days"] as const;

export default async function AccountingAgeingPage() {
  const tenant = await requireModuleAccess("accounting");
  if (!hasPermission(tenant, PERMISSIONS.ACCOUNTING_REPORTS_VIEW)) {
    return (
      <div className="space-y-6">
        <PageHeader title="AR/AP Ageing" description="Receivables and payables broken down by how overdue they are." />
        <EmptyState icon={Lock} title="You don't have access to this page" description="Ageing reports are limited to roles with reporting permissions." />
      </div>
    );
  }

  const currency = tenant.organization.currency ?? "GHS";
  const money = (value: Parameters<typeof formatMoney>[0]) => formatMoney(value, currency);
  const [receivables, payables] = await Promise.all([getReceivablesAgeing(tenant.organizationId), getPayablesAgeing(tenant.organizationId)]);

  return (
    <div className="space-y-6">
      <PageHeader title="AR/AP Ageing" description="Receivables and payables broken down by how overdue they are, as of today." />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Accounts receivable ageing</CardTitle>
              <CardDescription>Sent and overdue invoices not yet fully paid or credited.</CardDescription>
            </div>
            <ReportDownloadLinks baseHref="/api/reports/accounting/receivables-ageing" />
          </div>
        </CardHeader>
        <CardContent>
          {receivables.rows.length === 0 ? (
            <EmptyState icon={CalendarClock} title="No outstanding receivables" description="Every sent invoice has been fully paid or credited." />
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-5">
                {[receivables.totals.current, receivables.totals.days30, receivables.totals.days60, receivables.totals.days90, receivables.totals.over90].map((value, index) => (
                  <div key={BUCKET_HEADERS[index]} className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">{BUCKET_HEADERS[index]}</p>
                    <p className="text-lg font-medium">{money(value)}</p>
                  </div>
                ))}
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Due</TableHead>
                      {BUCKET_HEADERS.map((header) => <TableHead key={header} className="text-right">{header}</TableHead>)}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {receivables.rows.map((row) => (
                      <TableRow key={row.invoiceId}>
                        <TableCell className="font-mono text-xs">{row.invoiceNumber}</TableCell>
                        <TableCell className="font-medium">{row.customerName}</TableCell>
                        <TableCell className="text-muted-foreground">{row.dueDate.toLocaleDateString()}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{row.current > 0 ? money(row.current) : ""}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{row.days30 > 0 ? money(row.days30) : ""}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{row.days60 > 0 ? money(row.days60) : ""}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{row.days90 > 0 ? money(row.days90) : ""}</TableCell>
                        <TableCell className="text-right text-destructive">{row.over90 > 0 ? money(row.over90) : ""}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Accounts payable ageing</CardTitle>
              <CardDescription>Approved bills and supplier invoices not yet fully paid, from both Accounting and Procurement.</CardDescription>
            </div>
            <ReportDownloadLinks baseHref="/api/reports/accounting/payables-ageing" />
          </div>
        </CardHeader>
        <CardContent>
          {payables.rows.length === 0 ? (
            <EmptyState icon={CalendarClock} title="No outstanding payables" description="Every approved bill and supplier invoice has been fully paid." />
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-5">
                {[payables.totals.current, payables.totals.days30, payables.totals.days60, payables.totals.days90, payables.totals.over90].map((value, index) => (
                  <div key={BUCKET_HEADERS[index]} className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">{BUCKET_HEADERS[index]}</p>
                    <p className="text-lg font-medium">{money(value)}</p>
                  </div>
                ))}
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Source</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Due</TableHead>
                      {BUCKET_HEADERS.map((header) => <TableHead key={header} className="text-right">{header}</TableHead>)}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payables.rows.map((row) => (
                      <TableRow key={`${row.source}-${row.id}`}>
                        <TableCell className="text-muted-foreground">{row.source}</TableCell>
                        <TableCell className="font-mono text-xs">{row.reference}</TableCell>
                        <TableCell className="font-medium">{row.counterparty}</TableCell>
                        <TableCell className="text-muted-foreground">{row.dueDate.toLocaleDateString()}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{row.current > 0 ? money(row.current) : ""}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{row.days30 > 0 ? money(row.days30) : ""}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{row.days60 > 0 ? money(row.days60) : ""}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{row.days90 > 0 ? money(row.days90) : ""}</TableCell>
                        <TableCell className="text-right text-destructive">{row.over90 > 0 ? money(row.over90) : ""}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
