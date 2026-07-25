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
import { listFleetPayments } from "@/modules/fleet/service";
import { createPayment, verifyPayment } from "./actions";

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
  const payments = await listFleetPayments(tenant.organizationId);

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
    </div>
  );
}
