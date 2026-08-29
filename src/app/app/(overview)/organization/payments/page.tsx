import { CheckCircle2, Circle, CircleCheck, Lock, RotateCw, TriangleAlert, XCircle } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SettingsToggleRow } from "@/components/settings/settings-toggle-row";
import { Stepper, type StepperStep } from "@/components/ui/stepper";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { moduleRegistry, type BusinessModuleKey } from "@/platform/modules/registry";
import { getSettlementProfile, settlementStatusLabel, listOperationalPayments, runSettlementReadinessCheck, MODULES_WITH_OPERATIONAL_PAYMENT_SUPPORT } from "@/lib/payments/operational";
import { retrySettlementReconciliation, submitSettlementAccount, confirmBeneficiaryTerms, activateOnlineCollections } from "./actions";
import { loadBankOptions } from "./bank-options";

const ERROR_MESSAGES: Record<string, string> = {
  "retry-failed": "That payment could not be reconciled. Try again, or contact support if the problem continues.",
  settlement: "We could not verify or save that settlement account. Check the bank and account number and try again.",
  terms: "Confirm that you accept the settlement terms and that this account belongs to the organization or an authorized beneficiary before continuing.",
  "not-ready": "Online collections cannot be enabled yet - review the readiness checklist below.",
};

const SAVED_MESSAGES: Record<string, string> = {
  retried: "The payment's reconciliation state has been re-checked.",
  account: "Settlement account verified. Confirm the details below to continue.",
  terms: "Beneficiary confirmed.",
  activated: "Online collections are now active for this organization.",
};

const WIZARD_STEPS: StepperStep[] = [
  { id: "intro", label: "Overview" },
  { id: "account", label: "Settlement account" },
  { id: "terms", label: "Terms & beneficiary" },
  { id: "readiness", label: "Readiness check" },
];

function defaultStepForStatus(status: string | null): string {
  if (!status) return "intro";
  if (status === "PENDING") return "terms";
  return "readiness";
}

export default async function OrganizationPaymentsPage({ searchParams }: {
  searchParams: Promise<{ saved?: string; error?: string; step?: string }>;
}) {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.ORG_SETTINGS_MANAGE)) {
    return <EmptyState icon={Lock} title="Access denied" description="Only organization administrators can view payment reconciliation." />;
  }
  const { saved, error, step } = await searchParams;
  const [settlement, payments] = await Promise.all([
    getSettlementProfile(tenant.organizationId),
    listOperationalPayments(tenant.organizationId),
  ]);
  const currentStepId = step && WIZARD_STEPS.some((s) => s.id === step) ? step : defaultStepForStatus(settlement?.status ?? null);

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

      {saved && SAVED_MESSAGES[saved] ? <Alert><CheckCircle2 /><AlertTitle>Done</AlertTitle><AlertDescription>{SAVED_MESSAGES[saved]}</AlertDescription></Alert> : null}
      {error && ERROR_MESSAGES[error] ? <Alert variant="destructive"><TriangleAlert /><AlertTitle>Something needs attention</AlertTitle><AlertDescription>{ERROR_MESSAGES[error]}</AlertDescription></Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>Activate Online Collections</CardTitle>
          <CardDescription>A guided setup for connecting the organization&apos;s own Settlement Account - separate from Rock Frost&apos;s own subscription billing.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Stepper steps={WIZARD_STEPS} currentStepId={currentStepId} />

          {currentStepId === "intro" ? (
            <div className="space-y-4 text-sm">
              <div className="space-y-2 text-muted-foreground">
                <p><strong className="text-foreground">Rock Frost subscription billing</strong> is what your organization pays Rock Frost for the modules you use - Fleet, HR, Accounting, and so on.</p>
                <p><strong className="text-foreground">Operational collections</strong> are separate: they let your organization collect its own business payments (for example, a Fleet driver&apos;s remittance) directly from your customers through Paystack, settling into your own bank account.</p>
                <p>This wizard connects and verifies that Settlement Account. It never asks for or stores your Paystack credentials.</p>
              </div>
              <Button nativeButton={false} render={<Link href="?step=account" />}>Get started</Button>
            </div>
          ) : null}

          {currentStepId === "account" ? <AccountStep settlement={settlement} /> : null}

          {currentStepId === "terms" ? (
            settlement ? (
              <form action={confirmBeneficiaryTerms} className="space-y-4 text-sm">
                <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-3">
                  <div><p className="text-muted-foreground">Bank</p><p className="font-medium">{settlement.settlementBankName}</p></div>
                  <div><p className="text-muted-foreground">Account</p><p className="font-medium">&bull;&bull;&bull;&bull; {settlement.accountLast4}</p></div>
                  <div className="sm:col-span-3"><p className="text-muted-foreground">Account name</p><p className="font-medium">{settlement.accountName}</p></div>
                </div>
                <label className="flex items-start gap-2">
                  <input type="checkbox" name="acceptTerms" required className="mt-1" />
                  <span>I confirm this account belongs to the organization, or an authorized beneficiary, and I accept Rock Frost&apos;s settlement terms.</span>
                </label>
                <Button type="submit">Confirm and continue</Button>
              </form>
            ) : (
              <NoAccountYet />
            )
          ) : null}

          {currentStepId === "readiness" ? (
            settlement ? <ReadinessStep organizationId={tenant.organizationId} enabledModuleKeys={tenant.enabledModuleKeys} settlement={settlement} /> : <NoAccountYet />
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Settlement status</CardTitle>
          <CardDescription>The organization&apos;s connected Settlement Account.</CardDescription>
        </CardHeader>
        <CardContent>
          {settlement ? (
            <div className="grid gap-3 text-sm sm:grid-cols-3">
              <div><p className="text-muted-foreground">Bank</p><p className="font-medium">{settlement.settlementBankName}</p></div>
              <div><p className="text-muted-foreground">Account</p><p className="font-medium">&bull;&bull;&bull;&bull; {settlement.accountLast4}</p></div>
              <div><p className="text-muted-foreground">Status</p><p className="font-medium">{settlementStatusLabel(settlement.status)}</p></div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No settlement account has been started yet - use the wizard above.</p>
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

function NoAccountYet() {
  return (
    <p className="text-sm text-muted-foreground">
      Start by setting up a settlement account. <Link className="underline underline-offset-2" href="?step=account">Go to account setup</Link>.
    </p>
  );
}

async function AccountStep({ settlement }: { settlement: Awaited<ReturnType<typeof getSettlementProfile>> }) {
  const banks = await loadBankOptions();
  const bankItems = Object.fromEntries(banks.map((bank) => [bank.code, bank.name]));
  if (banks.length === 0) {
    return <p className="text-sm text-muted-foreground">The bank list isn&apos;t available right now - Paystack may not be configured for this environment. Contact Rock Frost support.</p>;
  }
  return (
    <form action={submitSettlementAccount} className="grid gap-4 text-sm sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="bankCode">Bank</Label>
        <Select name="bankCode" defaultValue={settlement?.settlementBankCode ?? ""} items={bankItems}>
          <SelectTrigger id="bankCode" className="w-full"><SelectValue placeholder="Choose a bank" /></SelectTrigger>
          <SelectContent>
            {banks.map((bank) => <SelectItem key={bank.code} value={bank.code}>{bank.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="accountNumber">Bank account number</Label>
        <Input id="accountNumber" name="accountNumber" inputMode="numeric" autoComplete="off" placeholder={settlement ? `Currently ending ${settlement.accountLast4}` : "Account number"} required />
      </div>
      <p className="text-xs text-muted-foreground sm:col-span-2">The full account number is sent securely to Paystack for verification and is not retained by Rock Frost. Only the masked last four digits and provider reference are stored.</p>
      <Button type="submit" className="sm:col-span-2">Verify account</Button>
    </form>
  );
}

async function ReadinessStep({ organizationId, enabledModuleKeys, settlement }: {
  organizationId: string;
  enabledModuleKeys: string[];
  settlement: NonNullable<Awaited<ReturnType<typeof getSettlementProfile>>>;
}) {
  const report = await runSettlementReadinessCheck(organizationId, { enabledModuleKeys, commit: false });
  return (
    <div className="space-y-4 text-sm">
      <ul className="space-y-2">
        {report.checks.map((check) => (
          <li key={check.key} className="flex items-start gap-2">
            {check.passed ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />}
            <div>
              <p className="font-medium">{check.label}</p>
              <p className="text-muted-foreground">{check.detail}</p>
            </div>
          </li>
        ))}
      </ul>

      {settlement.status === "ACTIVE" ? (
        <Alert><CheckCircle2 /><AlertTitle>Online collections are active</AlertTitle><AlertDescription>To change bank details, <Link className="underline underline-offset-2" href="?step=account">update the settlement account</Link>.</AlertDescription></Alert>
      ) : settlement.status === "SUSPENDED" ? (
        <Alert variant="destructive"><TriangleAlert /><AlertTitle>Restricted</AlertTitle><AlertDescription>This settlement account is administratively restricted. Contact Rock Frost support to resolve it.</AlertDescription></Alert>
      ) : report.overall === "READY" ? (
        <form action={activateOnlineCollections} className="space-y-4">
          <SettingsToggleRow id="enabled" name="enabled" label="Enable online collections" description="Once active, this organization can collect its own payments through Paystack." defaultChecked />
          <Button type="submit">Activate</Button>
        </form>
      ) : (
        <p className="flex items-center gap-2 text-muted-foreground"><Circle className="size-4 shrink-0" aria-hidden="true" />Resolve the items above, then refresh this page to check again.</p>
      )}
    </div>
  );
}
