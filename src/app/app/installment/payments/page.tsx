import { Receipt, Plus, Wallet, Lock } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/currency";
import { resolveInstallmentAccessScope } from "@/modules/installment/access";
import {
  listPayments,
  listAccounts,
  listCredits,
  getInstallmentSettings,
  canEditPayment,
} from "@/modules/installment/service";
import { createPayment, editPayment, resolveCredit, applyCredit, removePayment } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission for this action.",
  "missing-fields": "Please fill in all required fields.",
  "invalid-input": "Please check that the amount, date, and method are valid.",
  "future-date": "Payment date can't be in the future.",
  blocked: "This account can't accept new payments in its current state.",
  "edit-window": "This payment can only be edited within the settings edit window of when it was recorded.",
  "credit-locked": "This payment has a resolved or partially used credit and can't have its amount edited.",
  "credit-not-applicable": "That credit can't be applied to the selected account.",
  "wrong-password": "Incorrect password. This action requires re-entering your password to confirm.",
  "invalid-amount": "Payment amount must be a positive number.",
  "not-found": "That account could not be found.",
};

const CREDIT_BADGE: Record<string, "default" | "outline" | "destructive"> = {
  OPEN: "outline",
  REFUNDED: "default",
  APPLIED: "default",
  VOID: "destructive",
};

export default async function InstallmentPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const tenant = await requireModuleAccess("installment");
  const canManagePayments = hasPermission(tenant, PERMISSIONS.HIREPURCHASE_PAYMENTS_MANAGE);
  const canManageCredits = hasPermission(tenant, PERMISSIONS.HIREPURCHASE_CREDITS_MANAGE);

  if (!canManagePayments && !canManageCredits) {
    return (
      <div className="space-y-6">
        <PageHeader title="Payments" description="Installment payments and resulting customer credits." />
        <EmptyState icon={Lock} title="You don't have access to this page" description="Payments are limited to roles that can manage payments or customer credits." />
      </div>
    );
  }

  const scope = await resolveInstallmentAccessScope(tenant);
  if (scope.kind === "denied") {
    return (
      <div className="space-y-6">
        <PageHeader title="Payments" description="Installment payments and resulting customer credits." />
        <EmptyState
          icon={Lock}
          title="Staff access needs setup"
          description="Ask an administrator to link your login to one active installment staff profile before you continue."
        />
      </div>
    );
  }

  const [accounts, payments, credits, settings] = await Promise.all([
    listAccounts(tenant.organizationId, scope),
    canManagePayments ? listPayments(tenant.organizationId, scope) : Promise.resolve([]),
    canManageCredits ? listCredits(tenant.organizationId, scope) : Promise.resolve([]),
    canManagePayments ? getInstallmentSettings(tenant.organizationId) : Promise.resolve(null),
  ]);

  const currency = tenant.organization.currency;
  const payableAccounts = accounts.filter((a) => a.status !== "CANCELLED" && a.status !== "SUSPENDED" && a.status !== "CLOSED" && a.status !== "ARCHIVED" && Number(a.balance) > 0);
  const accountItems: Record<string, string> = Object.fromEntries(
    payableAccounts.map((a) => [a.id, `${a.customer.fullName} - ${a.product.name} (bal. ${formatMoney(a.balance, currency)})`])
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader title="Payments" description="Installment payments and resulting customer credits." />
        {canManagePayments && payableAccounts.length > 0 ? (
          <EntityDialog
            trigger={
              <Button size="sm">
                <Plus />
                Record payment
              </Button>
            }
            title="Record payment"
            action={createPayment}
          >
            <div className="space-y-2">
              <Label htmlFor="accountId">Account</Label>
              <Select name="accountId" items={accountItems}>
                <SelectTrigger id="accountId" className="w-full">
                  <SelectValue placeholder="Select an account" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(accountItems).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="amount">Amount ({currency})</Label>
                <Input id="amount" name="amount" type="number" step="0.01" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="paymentDate">Date</Label>
                <Input id="paymentDate" name="paymentDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="method">Method</Label>
              <Input id="method" name="method" placeholder="e.g. Cash, Mobile Money" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Input id="notes" name="notes" />
            </div>
          </EntityDialog>
        ) : null}
      </div>

      {saved ? (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
          Saved.
        </div>
      ) : null}
      {error && ERROR_MESSAGES[error] ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {ERROR_MESSAGES[error]}
        </div>
      ) : null}

      {canManagePayments && settings ? (
        payments.length === 0 ? (
          <EmptyState icon={Receipt} title="No payments yet" description="Payments you record will appear here." />
        ) : (
          <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Receipt</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Amount ({currency})</TableHead>
              {canManagePayments ? <TableHead /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.map((payment) => {
              const editable = canManagePayments && canEditPayment(payment, settings.paymentEditWindowHours);
              return (
                <TableRow key={payment.id}>
                  <TableCell className="font-medium">{payment.receiptNo}</TableCell>
                  <TableCell className="text-muted-foreground">{payment.account.customer.fullName}</TableCell>
                  <TableCell className="text-muted-foreground">{payment.paymentDate.toLocaleDateString()}</TableCell>
                  <TableCell className="text-muted-foreground">{payment.method}</TableCell>
                  <TableCell className="text-muted-foreground">{formatMoney(payment.amount, currency)}</TableCell>
                  {canManagePayments ? (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                      {editable ? (
                        <EntityDialog
                          trigger={
                            <Button size="sm" variant="ghost">
                              Edit
                            </Button>
                          }
                          title={`Edit payment: ${payment.receiptNo}`}
                          description={`Editable for ${settings.paymentEditWindowHours} hour(s) after recording.`}
                          action={editPayment}
                          submitLabel="Save changes"
                        >
                          <input type="hidden" name="id" value={payment.id} />
                          <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                              <Label htmlFor={`amount-${payment.id}`}>Amount ({currency})</Label>
                              <Input id={`amount-${payment.id}`} name="amount" type="number" step="0.01" defaultValue={payment.amount.toString()} required />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor={`paymentDate-${payment.id}`}>Date</Label>
                              <Input id={`paymentDate-${payment.id}`} name="paymentDate" type="date" defaultValue={payment.paymentDate.toISOString().slice(0, 10)} required />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`method-${payment.id}`}>Method</Label>
                            <Input id={`method-${payment.id}`} name="method" defaultValue={payment.method} required />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`notes-${payment.id}`}>Notes</Label>
                            <Input id={`notes-${payment.id}`} name="notes" defaultValue={payment.notes ?? ""} />
                          </div>
                        </EntityDialog>
                      ) : null}
                      <EntityDialog
                        trigger={<Button size="sm" variant="ghost">Delete</Button>}
                        title={`Delete payment: ${payment.receiptNo}`}
                        description="This reverses the payment, recalculates the account, and is written to the audit log. Resolved credits block deletion."
                        action={removePayment}
                        submitLabel="Delete payment"
                      >
                        <input type="hidden" name="id" value={payment.id} />
                        <div className="space-y-2">
                          <Label htmlFor={`delete-payment-password-${payment.id}`}>Your password</Label>
                          <Input id={`delete-payment-password-${payment.id}`} name="confirmPassword" type="password" required />
                        </div>
                      </EntityDialog>
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              );
            })}
          </TableBody>
          </Table>
        )
      ) : null}

      {canManageCredits ? <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Wallet className="size-5 text-muted-foreground" />
            <CardTitle>Customer credits</CardTitle>
          </div>
          <CardDescription>Overpayments and account-closure refunds owed to customers.</CardDescription>
        </CardHeader>
        <CardContent>
          {credits.length === 0 ? (
            <p className="text-sm text-muted-foreground">No credits recorded.</p>
          ) : (
            <div className="space-y-2">
              {credits.map((credit) => {
                const applicableAccounts = accounts.filter((a) => a.customerId === credit.customerId && Number(a.balance) > 0);
                const applicableAccountItems: Record<string, string> = Object.fromEntries(
                  applicableAccounts.map((a) => [a.id, `${a.product.name} (bal. ${formatMoney(a.balance, currency)})`])
                );

                return (
                  <div key={credit.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="text-sm font-medium">
                        {credit.customer.fullName} - {formatMoney(credit.remainingAmount, currency)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {credit.source.replaceAll("_", " ")} · {credit.notes}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={CREDIT_BADGE[credit.status]}>{credit.status}</Badge>
                      {canManageCredits && credit.status === "OPEN" ? (
                        <div className="flex gap-1">
                          {applicableAccounts.length > 0 ? (
                            <EntityDialog
                              trigger={
                                <Button size="sm" variant="ghost">
                                  Apply
                                </Button>
                              }
                              title="Apply credit to an account"
                              description={`Apply up to ${formatMoney(credit.remainingAmount, currency)} toward another account for this customer.`}
                              action={applyCredit}
                              submitLabel="Apply"
                            >
                              <input type="hidden" name="creditId" value={credit.id} />
                              <div className="space-y-2">
                                <Label htmlFor={`targetAccountId-${credit.id}`}>Account</Label>
                                <Select name="targetAccountId" items={applicableAccountItems}>
                                  <SelectTrigger id={`targetAccountId-${credit.id}`} className="w-full">
                                    <SelectValue placeholder="Select an account" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {Object.entries(applicableAccountItems).map(([value, label]) => (
                                      <SelectItem key={value} value={value}>
                                        {label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </EntityDialog>
                          ) : null}
                          <EntityDialog
                            trigger={
                              <Button size="sm" variant="ghost">
                                Mark refunded
                              </Button>
                            }
                            title="Confirm refund"
                            description="Re-enter your password to confirm this pays the customer out in cash."
                            action={resolveCredit}
                            submitLabel="Confirm refund"
                          >
                            <input type="hidden" name="id" value={credit.id} />
                            <input type="hidden" name="decision" value="refund" />
                            <div className="space-y-2">
                              <Label htmlFor={`refund-password-${credit.id}`}>Your password</Label>
                              <Input id={`refund-password-${credit.id}`} name="confirmPassword" type="password" required />
                            </div>
                          </EntityDialog>
                          <EntityDialog
                            trigger={
                              <Button size="sm" variant="ghost">
                                Void
                              </Button>
                            }
                            title="Confirm void"
                            description="Re-enter your password to confirm this credit should be discarded."
                            action={resolveCredit}
                            submitLabel="Confirm void"
                          >
                            <input type="hidden" name="id" value={credit.id} />
                            <input type="hidden" name="decision" value="void" />
                            <div className="space-y-2">
                              <Label htmlFor={`void-password-${credit.id}`}>Your password</Label>
                              <Input id={`void-password-${credit.id}`} name="confirmPassword" type="password" required />
                            </div>
                          </EntityDialog>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card> : null}
    </div>
  );
}
