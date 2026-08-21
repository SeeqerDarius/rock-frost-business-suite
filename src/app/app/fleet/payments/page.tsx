import { Receipt, Plus } from "lucide-react";
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
import { createPayment, verifyPayment, reviewDriverSubmission } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage payments.",
  "missing-fields": "Reference, amount, and type are required.",
  duplicate: "A payment with that reference already exists.",
  "invalid-input": "Please check that the reference, amount, and type are valid.",
};

const TYPE_LABELS: Record<string, string> = {
  WEEKLY_SALES: "Weekly sales",
  OWNER_PAYOUT: "Owner payout",
  DRIVER_PAYMENT: "Driver payment",
  MAINTENANCE: "Maintenance",
  WORK_AND_PAY: "Work & pay",
  OTHER: "Other",
};

const SUBMISSION_LABELS: Record<string, string> = {
  DAILY_SALES: "Daily sales",
  WEEKLY_SALES: "Weekly sales",
  WORK_AND_PAY: "Work & Pay",
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
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const tenant = await requireModuleAccess("fleet");
  const canManage = hasPermission(tenant, PERMISSIONS.FLEET_PAYMENTS_MANAGE);
  const [payments, driverSubmissions] = await Promise.all([listFleetPayments(tenant.organizationId), listFleetDriverPaymentSubmissions(tenant.organizationId)]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader title="Payments" description="Weekly sales, Work & Pay collections, owner payouts, driver payments, and fleet transactions." />
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
              <TableHead>Amount</TableHead>
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
                <TableCell className="text-muted-foreground">{Number(payment.amount).toFixed(2)}</TableCell>
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
          <h2 className="font-semibold">Driver-submitted collections</h2>
          <p className="text-sm text-muted-foreground">Review the assigned vehicle, period, target, variance, and payment details before verification.</p>
          <div className="mt-3 space-y-2">
            {driverSubmissions.map((item) => {
              const variance = item.expectedAmount ? Number(item.amount) - Number(item.expectedAmount) : null;
              return (
                <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 border-b py-3 text-sm">
                  <div>
                    <p className="font-medium">{item.driver.name}. {item.vehicle?.plateNumber ?? "No vehicle"}. {SUBMISSION_LABELS[item.submissionType]}</p>
                    <p className="text-muted-foreground">
                      {item.periodStart.toLocaleDateString()} to {item.periodEnd.toLocaleDateString()}. {tenant.organization.currency ?? "GHS"} {Number(item.amount).toFixed(2)}.
                      {variance === null ? "" : ` Target ${Number(item.expectedAmount).toFixed(2)}, variance ${variance >= 0 ? "+" : ""}${variance.toFixed(2)}.`} {item.paymentMethod}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={item.status === "APPROVED" ? "default" : item.status === "REJECTED" ? "destructive" : "outline"}>{item.status}</Badge>
                    {item.status === "PENDING" ? (
                      <>
                        <form action={reviewDriverSubmission}><input type="hidden" name="id" value={item.id} /><Button size="sm" name="decision" value="approve">Approve</Button></form>
                        <form action={reviewDriverSubmission}><input type="hidden" name="id" value={item.id} /><Button size="sm" name="decision" value="reject" variant="destructive">Reject</Button></form>
                      </>
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
