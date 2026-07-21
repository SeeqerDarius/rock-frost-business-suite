import { ReceiptText } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listSales } from "@/modules/pos/service";
import { refundExistingSale } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage sales.",
  "invalid-state": "Only completed sales can be refunded.",
  "not-found": "That sale could not be found.",
};

const STATUS_BADGE: Record<string, "default" | "outline" | "destructive" | "secondary"> = {
  COMPLETED: "default",
  REFUNDED: "destructive",
  VOIDED: "outline",
};

export default async function PosSalesPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const tenant = await requireCurrentTenant();
  const canManage = hasPermission(tenant, PERMISSIONS.POS_SALES_MANAGE);
  const sales = await listSales(tenant.organizationId);

  return (
    <div className="space-y-6">
      <PageHeader title="Sales" description="Every sale recorded across every register." />

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
              <TableHead>Total</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead>Status</TableHead>
              {canManage ? <TableHead /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sales.map((sale) => (
              <TableRow key={sale.id}>
                <TableCell className="font-mono text-xs">{sale.saleNumber}</TableCell>
                <TableCell className="text-muted-foreground">{sale.register.name}</TableCell>
                <TableCell className="text-muted-foreground">{sale.customerName ?? "-"}</TableCell>
                <TableCell className="font-medium">{Number(sale.total).toFixed(2)}</TableCell>
                <TableCell className="text-muted-foreground">{sale.paymentMethod}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_BADGE[sale.status]}>{sale.status}</Badge>
                </TableCell>
                {canManage ? (
                  <TableCell className="text-right">
                    {sale.status === "COMPLETED" ? (
                      <form action={refundExistingSale}>
                        <input type="hidden" name="id" value={sale.id} />
                        <Button type="submit" size="sm" variant="ghost">Refund</Button>
                      </form>
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
