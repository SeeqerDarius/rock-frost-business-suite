import { ReceiptText } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listSales } from "@/modules/pos/service";
import { returnSale, resumeSale } from "./actions";
import { ReturnFields } from "./return-fields";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage sales.",
  "invalid-return": "The return is invalid or exceeds the remaining sold quantity.",
  "invalid-payment": "The payment must equal the suspended sale total.",
  "not-found": "That sale could not be found.",
};

const STATUS_BADGE: Record<string, "default" | "outline" | "destructive" | "secondary"> = {
  COMPLETED: "default",
  SUSPENDED: "secondary",
  PARTIALLY_REFUNDED: "secondary",
  REFUNDED: "destructive",
  VOIDED: "outline",
};

export default async function PosSalesPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const tenant = await requireModuleAccess("pos");
  const canManage = hasPermission(tenant, PERMISSIONS.POS_SALES_MANAGE);
  const canReturn = hasPermission(tenant, PERMISSIONS.POS_RETURNS_MANAGE);
  const sales = await listSales(tenant.organizationId);

  return (
    <div className="space-y-6">
      <PageHeader title="Orders" description="Every sale recorded across every register." />

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

      {sales.length === 0 ? (
        <EmptyState icon={ReceiptText} title="No sales yet" description="Sales you record on the Sell page will appear here." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Number</TableHead>
              <TableHead>Register</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Employee</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead>Status</TableHead>
              {canManage || canReturn ? <TableHead /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sales.map((sale) => (
              <TableRow key={sale.id}>
                <TableCell className="font-mono text-xs">{sale.saleNumber}</TableCell>
                <TableCell className="text-muted-foreground">{sale.register.name}</TableCell>
                <TableCell className="text-muted-foreground">{sale.customerName ?? "-"}</TableCell>
                <TableCell className="text-muted-foreground">{sale.soldBy?.name ?? "-"}</TableCell>
                <TableCell className="font-medium">{Number(sale.total).toFixed(2)}</TableCell>
                <TableCell className="text-muted-foreground">{sale.paymentMethod}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_BADGE[sale.status]}>{sale.status}</Badge>
                </TableCell>
                {canManage || canReturn ? (
                  <TableCell className="text-right">
                    {sale.status === "SUSPENDED" && canManage ? <EntityDialog trigger={<Button size="sm" variant="ghost">Resume</Button>} title={`Resume ${sale.saleNumber}`} action={resumeSale} submitLabel="Complete sale"><input type="hidden" name="saleId" value={sale.id} /><div className="space-y-2"><Label>Payment method</Label><select name="method" className="h-8 w-full rounded-lg border bg-background px-2"><option value="CASH">Cash</option><option value="CARD">Card</option><option value="MOBILE_MONEY">Mobile money</option><option value="OTHER">Other</option></select></div><div className="space-y-2"><Label>Amount</Label><Input name="amount" type="number" step="0.01" defaultValue={Number(sale.total).toFixed(2)} /></div></EntityDialog> : null}
                    {canReturn && ["COMPLETED", "PARTIALLY_REFUNDED"].includes(sale.status) ? <EntityDialog trigger={<Button size="sm" variant="ghost">Return items</Button>} title={`Return from ${sale.saleNumber}`} action={returnSale} submitLabel="Record return"><input type="hidden" name="saleId" value={sale.id} /><ReturnFields lines={sale.lines.map((line) => ({ id: line.id, description: line.description, remaining: line.quantity - line.returnLines.reduce((sum, returned) => sum + returned.quantity, 0) })).filter((line) => line.remaining > 0)} /><div className="space-y-2"><Label>Reason</Label><Input name="reason" required /></div><div className="space-y-2"><Label>Refund method</Label><select name="refundMethod" className="h-8 w-full rounded-lg border bg-background px-2"><option value="CASH">Cash</option><option value="CARD">Card</option><option value="MOBILE_MONEY">Mobile money</option><option value="OTHER">Other</option></select></div></EntityDialog> : null}
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
