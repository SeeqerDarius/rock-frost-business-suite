import { Receipt, Plus, Lock } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listFleetPayments, listFleetDriverPaymentSubmissions } from "@/modules/fleet/service";
import { createPayment, verifyPayment } from "./actions";
import { SubmissionReviewControls } from "./submission-review-controls";
import { listOperationalPayments } from "@/lib/payments/operational";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage payments.",
  "missing-fields": "Reference, amount, and type are required.",
  duplicate: "A payment with that reference already exists.",
  "invalid-input": "Please check that the reference, amount, and type are valid.",
  "already-reviewed": "This driver payment has already been reviewed. Refresh the page to see its current status.",
  "review-failed": "The driver payment could not be reviewed. Please try again or contact support if the problem continues.",
};

const TYPE_LABELS: Record<string, string> = {
  WEEKLY_SALES: "Vehicle remittance",
  OWNER_PAYOUT: "Owner payout",
  DRIVER_PAYMENT: "Driver payment",
  MAINTENANCE: "Maintenance",
  WORK_AND_PAY: "Work & pay",
  OTHER: "Other",
};

const SUBMISSION_LABELS: Record<string, string> = {
  DAILY_SALES: "Daily vehicle remittance",
  WEEKLY_SALES: "Weekly vehicle remittance",
  WORK_AND_PAY: "Work & Pay instalment",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  MOBILE_MONEY: "Mobile money",
  BANK_TRANSFER: "Bank transfer",
  CARD: "Card",
  CHEQUE: "Cheque",
  OTHER: "Other",
};

const STATUS_BADGE: Record<string, "default" | "outline" | "destructive"> = {
  PENDING: "outline",
  VERIFIED: "default",
  REJECTED: "destructive",
  CANCELLED: "destructive",
};

export default async function FleetPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; reviewed?: string; error?: string }>;
}) {
  const { saved, reviewed, error } = await searchParams;
  const tenant = await requireModuleAccess("fleet");
  const canManage = hasPermission(tenant, PERMISSIONS.FLEET_PAYMENTS_MANAGE);
  if (!canManage) {
    return (
      <div className="space-y-6">
        <PageHeader title="Payments" description="Driver remittances, Work & Pay instalments, owner payouts, and other fleet transactions." />
        <EmptyState icon={Lock} title="You don't have access to this page" description="Fleet payments are limited to roles with payment-management permissions." />
      </div>
    );
  }
  const [payments, driverSubmissions, onlinePayments] = await Promise.all([listFleetPayments(tenant.organizationId), listFleetDriverPaymentSubmissions(tenant.organizationId), listOperationalPayments(tenant.organizationId)]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader title="Payments" description="Driver remittances, Work & Pay instalments, owner payouts, and other fleet transactions." />
        {canManage ? (
          <EntityDialog
            trigger={
              <Button size="sm">
                <Plus />
                New payment
              </Button>
            }
            title="New payment"
            action={createPayment}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="reference">Reference</Label>
                <Input id="reference" name="reference" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">Amount</Label>
                <Input id="amount" name="amount" type="number" step="0.01" required />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="type">Type</Label>
                <Select name="type" items={TYPE_LABELS}>
                  <SelectTrigger id="type" className="w-full">
                    <SelectValue placeholder="Select a type" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TYPE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="date">Date</Label>
                <Input id="date" name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="relatedEntity">Related to (optional)</Label>
              <Input id="relatedEntity" name="relatedEntity" placeholder="e.g. FleetOwner, FleetDriver" />
            </div>
          </EntityDialog>
        ) : null}
      </div>

      {saved ? (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
          Saved.
        </div>
      ) : null}
      {reviewed === "approved" || reviewed === "rejected" ? (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
          {reviewed === "approved"
            ? "Driver payment approved and added to the verified Fleet payment ledger."
            : "Driver payment rejected."}
        </div>
      ) : null}
      {error && ERROR_MESSAGES[error] ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {ERROR_MESSAGES[error]}
        </div>
      ) : null}

      {payments.length === 0 ? (
        <EmptyState icon={Receipt} title="No payments yet" description="Payments you record will appear here." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Reference</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Amount ({tenant.organization.currency ?? "GHS"})</TableHead>
              <TableHead>Status</TableHead>
              {canManage ? <TableHead /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.map((payment) => (
              <TableRow key={payment.id}>
                <TableCell className="font-medium">{payment.reference}</TableCell>
                <TableCell className="text-muted-foreground">{payment.date.toLocaleDateString()}</TableCell>
                <TableCell className="text-muted-foreground">{TYPE_LABELS[payment.type]}</TableCell>
                <TableCell className="text-muted-foreground">{tenant.organization.currency ?? "GHS"} {Number(payment.amount).toFixed(2)}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_BADGE[payment.status]}>{payment.status}</Badge>
                </TableCell>
                {canManage ? (
                  <TableCell className="text-right">
                    {payment.status === "PENDING" ? (
                      <div className="flex justify-end gap-1">
                        <form action={verifyPayment}>
                          <input type="hidden" name="id" value={payment.id} />
                          <input type="hidden" name="decision" value="verify" />
                          <Button type="submit" size="sm" variant="ghost">
                            Verify
                          </Button>
                        </form>
                        <form action={verifyPayment}>
                          <input type="hidden" name="id" value={payment.id} />
                          <input type="hidden" name="decision" value="reject" />
                          <Button type="submit" size="sm" variant="ghost">
                            Reject
                          </Button>
                        </form>
                      </div>
                    ) : null}
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {canManage ? (
        <section className="rounded-xl border p-5">
          <h2 className="font-semibold">Online collection reconciliation</h2>
          <p className="text-sm text-muted-foreground">Paystack confirmations, settlement routing, receipts, and Accounting posting state for this organization only.</p>
          {onlinePayments.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No online operational payments yet.</p> : <div className="mt-3 overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Reference</TableHead><TableHead>Purpose</TableHead><TableHead>Amount</TableHead><TableHead>Payment</TableHead><TableHead>Reconciliation</TableHead><TableHead>Receipt</TableHead></TableRow></TableHeader><TableBody>{onlinePayments.map((item) => <TableRow key={item.id}><TableCell className="font-medium">{item.providerReference}</TableCell><TableCell>{item.purpose.replaceAll("_", " ")}</TableCell><TableCell>{item.currency} {Number(item.amount).toFixed(2)}</TableCell><TableCell><Badge variant={item.status === "SUCCESS" ? "default" : item.status === "FAILED" ? "destructive" : "outline"}>{item.status}</Badge></TableCell><TableCell>{item.reconciliationStatus.replaceAll("_", " ")}</TableCell><TableCell>{item.receiptNumber ?? "Pending"}</TableCell></TableRow>)}</TableBody></Table></div>}
        </section>
      ) : null}
      {canManage ? (
        <section className="rounded-xl border p-5">
          <h2 className="font-semibold">Driver-recorded payments</h2>
          <p className="text-sm text-muted-foreground">Confirm that the company received the payment. Review its assigned vehicle, payment period, required amount, variance, method, and reference before approval.</p>
          <div className="mt-3 space-y-2">
            {driverSubmissions.map((item) => {
              const variance = item.expectedAmount ? Number(item.amount) - Number(item.expectedAmount) : null;
              return (
                <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 border-b py-3 text-sm">
                  <div>
                    <p className="font-medium">{item.driver.name}. {item.vehicle?.plateNumber ?? "No vehicle"}. {SUBMISSION_LABELS[item.submissionType]}</p>
                    <p className="text-muted-foreground">
                      {item.periodStart.toLocaleDateString()} to {item.periodEnd.toLocaleDateString()}. {tenant.organization.currency ?? "GHS"} {Number(item.amount).toFixed(2)}.
                      {variance === null ? "" : ` Required ${Number(item.expectedAmount).toFixed(2)}, variance ${variance >= 0 ? "+" : ""}${variance.toFixed(2)}.`} {PAYMENT_METHOD_LABELS[item.paymentMethod] ?? item.paymentMethod}{item.reference ? `, reference ${item.reference}` : ""}.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={item.status === "APPROVED" ? "default" : item.status === "REJECTED" ? "destructive" : "outline"}>{item.status}</Badge>
                    {item.status === "PENDING" ? (
                      <SubmissionReviewControls submissionId={item.id} />
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
