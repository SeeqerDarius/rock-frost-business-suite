import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePlatformOperator } from "@/lib/auth/module-access";
import { formatMoney } from "@/lib/currency";
import { getPaymentLedger, getPaymentTotals } from "@/platform/billing/service";

export default async function PlatformBillingPage({ searchParams }: { searchParams: Promise<{ organizationId?: string }> }) {
  await requirePlatformOperator();
  const { organizationId } = await searchParams;
  const [ledger, totalsByCurrency] = await Promise.all([
    getPaymentLedger({ organizationId }),
    getPaymentTotals(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Billing" description="Every subscription payment attempt across organizations, successful or failed." />

      {organizationId ? (
        <div className="flex items-center justify-between rounded-md border bg-muted/40 p-3 text-sm">
          <span>Showing payments for one organization only.</span>
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/app/platform/billing" />}>Show all organizations</Button>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries(totalsByCurrency).length === 0 ? (
          <Card><CardContent className="pt-6 text-sm text-muted-foreground">No payments recorded yet.</CardContent></Card>
        ) : (
          Object.entries(totalsByCurrency).map(([currency, totals]) => (
            <Card key={currency}>
              <CardHeader><CardTitle>{currency}</CardTitle><CardDescription>{totals.successCount} successful, {totals.failedCount} failed</CardDescription></CardHeader>
              <CardContent className="space-y-1">
                <p className="text-2xl font-semibold">{formatMoney(totals.collected, currency)}</p>
                <p className="text-xs text-muted-foreground">collected</p>
                {totals.failedAmount > 0 ? <p className="text-sm text-destructive">{formatMoney(totals.failedAmount, currency)} in failed attempts</p> : null}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Card>
        <CardHeader><CardTitle>Payment ledger</CardTitle><CardDescription>Most recent {ledger.length} payment {ledger.length === 1 ? "attempt" : "attempts"}.</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          {ledger.length === 0 ? <p className="text-sm text-muted-foreground">No payments to show.</p> : ledger.map((payment) => (
            <div key={payment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
              <div>
                <Link href={`/app/platform/organizations/${payment.organizationId}`} className="text-sm font-medium hover:underline">{payment.organizationName}</Link>
                <p className="text-xs text-muted-foreground">
                  {payment.invoiceCode ?? "No invoice code"} · {payment.gatewayProvider} · {(payment.paidAt ?? payment.createdAt).toLocaleString()}
                  {payment.failureReason ? ` · ${payment.failureReason}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{formatMoney(payment.amount, payment.currency)}</span>
                <Badge variant={payment.status === "SUCCESS" ? "default" : "destructive"}>{payment.status}</Badge>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
