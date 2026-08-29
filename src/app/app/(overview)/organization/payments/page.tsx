import { CheckCircle2, CircleCheck, Lock, RotateCw, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { moduleRegistry, type BusinessModuleKey } from "@/platform/modules/registry";
import { getSettlementProfile, settlementStatusLabel, listOperationalPayments, MODULES_WITH_OPERATIONAL_PAYMENT_SUPPORT } from "@/lib/payments/operational";
import { retrySettlementReconciliation } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  "retry-failed": "That payment could not be reconciled. Try again, or contact support if the problem continues.",
};

export default async function OrganizationPaymentsPage({ searchParams }: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.ORG_SETTINGS_MANAGE)) {
    return <EmptyState icon={Lock} title="Access denied" description="Only organization administrators can view payment reconciliation." />;
  }
  const { saved, error } = await searchParams;
  const [settlement, payments] = await Promise.all([
    getSettlementProfile(tenant.organizationId),
    listOperationalPayments(tenant.organizationId),
  ]);
  const moduleSupport = tenant.enabledModuleKeys
    .map((key) => moduleRegistry.find((module_) => module_.key === key))
    .filter((module_): module_ is NonNullable<typeof module_> => Boolean(module_))
    .map((module_) => ({
      key: module_.key,
      name: module_.name,
      supported: MODULES_WITH_OPERATIONAL_PAYMENT_SUPPORT.includes(module_.key as BusinessModuleKey),
    }));

  return (
    <div className="space-y-6">
      <PageHeader title="Payments and reconciliation" description="Settlement status, online collection reconciliation, and receipts across every module - not Fleet-only." />

      {saved === "retried" ? <Alert><CheckCircle2 /><AlertTitle>Reconciliation retried</AlertTitle><AlertDescription>The payment&apos;s reconciliation state has been re-checked.</AlertDescription></Alert> : null}
      {error && ERROR_MESSAGES[error] ? <Alert variant="destructive"><TriangleAlert /><AlertTitle>Retry failed</AlertTitle><AlertDescription>{ERROR_MESSAGES[error]}</AlertDescription></Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>Settlement status</CardTitle>
          <CardDescription>The organization&apos;s connected Settlement Account, configured in Workspace settings.</CardDescription>
        </CardHeader>
        <CardContent>
          {settlement ? (
            <div className="grid gap-3 text-sm sm:grid-cols-3">
              <div><p className="text-muted-foreground">Bank</p><p className="font-medium">{settlement.settlementBankName}</p></div>
              <div><p className="text-muted-foreground">Account</p><p className="font-medium">&bull;&bull;&bull;&bull; {settlement.accountLast4}</p></div>
              <div><p className="text-muted-foreground">Status</p><p className="font-medium">{settlementStatusLabel(settlement.status)}</p></div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No settlement account has been started yet. <Link className="underline underline-offset-2" href="/app/organization/settings">Set one up in Workspace settings</Link>.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Modules with online collections</CardTitle>
          <CardDescription>Online collections are wired into these enabled modules today. Not every module supports it yet.</CardDescription>
        </CardHeader>
        <CardContent>
          {moduleSupport.length === 0 ? (
            <p className="text-sm text-muted-foreground">No modules are enabled for this organization yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {moduleSupport.map((module_) => (
                <li key={module_.key} className="flex items-center gap-2">
                  {module_.supported ? <CircleCheck className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" /> : <span className="size-4 shrink-0" aria-hidden="true" />}
                  <span className={module_.supported ? "font-medium" : "text-muted-foreground"}>{module_.name}</span>
                  {!module_.supported ? <span className="text-xs text-muted-foreground">Not yet available</span> : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Online collection reconciliation</CardTitle>
          <CardDescription>Paystack confirmations, settlement routing, receipts, and Accounting posting state for this organization only.</CardDescription>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No online operational payments yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Module</TableHead>
                    <TableHead>Purpose</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>Reconciliation</TableHead>
                    <TableHead>Receipt</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.providerReference}</TableCell>
                      <TableCell className="capitalize">{item.sourceModule}</TableCell>
                      <TableCell>{item.purpose.replaceAll("_", " ")}</TableCell>
                      <TableCell>{item.currency} {Number(item.amount).toFixed(2)}</TableCell>
                      <TableCell><Badge variant={item.status === "SUCCESS" ? "default" : item.status === "FAILED" ? "destructive" : "outline"}>{item.status}</Badge></TableCell>
                      <TableCell>{item.reconciliationStatus.replaceAll("_", " ")}</TableCell>
                      <TableCell>{item.receiptNumber ?? "Pending"}</TableCell>
                      <TableCell>
                        {item.reconciliationStatus === "NEEDS_RETRY" ? (
                          <form action={retrySettlementReconciliation}>
                            <input type="hidden" name="paymentId" value={item.id} />
                            <Button type="submit" size="sm" variant="outline"><RotateCw aria-hidden="true" />Retry</Button>
                          </form>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
