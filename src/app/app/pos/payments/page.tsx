import { Lock, Wallet } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/currency";
import { listPayments } from "@/modules/pos/service";

const METHOD_LABEL: Record<string, string> = {
  CASH: "Cash",
  CARD: "Card",
  MOBILE_MONEY: "Mobile money",
  OTHER: "Other",
};

export default async function PosPaymentsPage() {
  const tenant = await requireModuleAccess("pos");

  if (!hasPermission(tenant, PERMISSIONS.POS_REPORTS_VIEW)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Payments" description="Every payment recorded against a sale." />
        <EmptyState icon={Lock} title="You don't have access to this page" description="Payment history is limited to roles with reporting permissions." />
      </div>
    );
  }

  const payments = await listPayments(tenant.organizationId);
  const totalByMethod = payments.reduce<Record<string, number>>((totals, payment) => {
    totals[payment.method] = (totals[payment.method] ?? 0) + Number(payment.amount);
    return totals;
  }, {});
  const money = (value: Parameters<typeof formatMoney>[0]) => formatMoney(value, tenant.organization.currency);

  return (
    <div className="space-y-6">
      <PageHeader title="Payments" description="Every payment recorded against a sale, across every register." />

      {payments.length === 0 ? (
        <EmptyState icon={Wallet} title="No payments yet" description="Payments recorded on the Sell page will appear here." />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(totalByMethod).map(([method, total]) => (
              <div key={method} className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">{METHOD_LABEL[method] ?? method}</p>
                <p className="text-lg font-semibold">{money(total)}</p>
              </div>
            ))}
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Sale</TableHead>
                <TableHead>Register</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Amount ({tenant.organization.currency})</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell className="text-muted-foreground">{new Date(payment.createdAt).toLocaleString()}</TableCell>
                  <TableCell className="font-mono text-xs">{payment.sale.saleNumber}</TableCell>
                  <TableCell className="text-muted-foreground">{payment.sale.register.name}</TableCell>
                  <TableCell>{METHOD_LABEL[payment.method] ?? payment.method}</TableCell>
                  <TableCell className="text-muted-foreground">{payment.reference ?? "-"}</TableCell>
                  <TableCell className="font-medium">{money(payment.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}
    </div>
  );
}
