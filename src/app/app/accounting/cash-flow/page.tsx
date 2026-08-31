import { Lock, Waves } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/currency";
import { getCashFlowStatement } from "@/modules/accounting/service";
import { ReportDownloadLinks } from "@/components/reports/report-download-links";

function monthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export default async function AccountingCashFlowPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from: fromParam, to: toParam } = await searchParams;
  const tenant = await requireModuleAccess("accounting");
  if (!hasPermission(tenant, PERMISSIONS.ACCOUNTING_REPORTS_VIEW)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Cash Flow Statement" description="Cash movement by activity, direct method." />
        <EmptyState icon={Lock} title="You don't have access to this page" description="The cash-flow statement is limited to roles with reporting permissions." />
      </div>
    );
  }

  const currency = tenant.organization.currency ?? "GHS";
  const money = (value: Parameters<typeof formatMoney>[0]) => formatMoney(value, currency);
  const today = new Date();
  const to = toParam ? new Date(toParam) : today;
  const from = fromParam ? new Date(fromParam) : monthStart(today);
  const report = await getCashFlowStatement(tenant.organizationId, from, to);
  const reconciles = Math.abs(report.openingCash + report.netChange - report.closingCash) < 0.01;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cash Flow Statement"
        description={`Direct method - cash movement by activity, ${from.toLocaleDateString()} to ${to.toLocaleDateString()}.`}
        actions={<ReportDownloadLinks baseHref={`/api/reports/accounting/cash-flow?from=${from.toISOString().slice(0, 10)}&to=${to.toISOString().slice(0, 10)}`} />}
      />

      <form className="flex flex-wrap items-end gap-3 rounded-md border p-4" action="/app/accounting/cash-flow">
        <div className="space-y-1">
          <label htmlFor="from" className="text-xs text-muted-foreground">From</label>
          <input id="from" name="from" type="date" defaultValue={from.toISOString().slice(0, 10)} className="h-9 rounded-md border bg-background px-3 text-sm" />
        </div>
        <div className="space-y-1">
          <label htmlFor="to" className="text-xs text-muted-foreground">To</label>
          <input id="to" name="to" type="date" defaultValue={to.toISOString().slice(0, 10)} className="h-9 rounded-md border bg-background px-3 text-sm" />
        </div>
        <button type="submit" className="h-9 rounded-md border bg-muted px-3 text-sm hover:bg-muted/70">Update</button>
      </form>

      <Card>
        <CardHeader>
          <CardTitle>Cash flow by activity</CardTitle>
          <CardDescription>Every cash, bank, or mobile-money journal line posted in this period, categorized by its originating transaction.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {report.operating === 0 && report.investing === 0 && report.financing === 0 ? (
            <EmptyState icon={Waves} title="No cash movement in this period" description="Post a payment, receipt, or expense within this date range to see it here." />
          ) : (
            <>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between"><span>Operating activities</span><span className="font-mono">{money(report.operating)}</span></div>
                <div className="flex items-center justify-between text-muted-foreground"><span>Investing activities</span><span className="font-mono">{money(report.investing)}</span></div>
                <div className="flex items-center justify-between text-muted-foreground"><span>Financing activities</span><span className="font-mono">{money(report.financing)}</span></div>
                <div className="flex items-center justify-between border-t pt-2 font-medium"><span>Net change in cash</span><span className="font-mono">{money(report.netChange)}</span></div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Opening cash</p><p className="text-lg font-medium">{money(report.openingCash)}</p></div>
                <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Net change</p><p className="text-lg font-medium">{money(report.netChange)}</p></div>
                <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Closing cash</p><p className="text-lg font-medium">{money(report.closingCash)}</p></div>
              </div>
              <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                <span>Opening + net change = closing</span>
                <span className={reconciles ? "font-medium text-emerald-600 dark:text-emerald-400" : "font-medium text-destructive"}>{reconciles ? "Reconciled" : "Not reconciled"}</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
