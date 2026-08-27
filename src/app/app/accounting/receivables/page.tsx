import { UsersRound } from "lucide-react";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/currency";
import { getReceivablesSummary } from "@/modules/accounting/service";

export default async function AccountingReceivablesPage() {
  const tenant = await requireModuleAccess("accounting");
  const canView = hasPermission(tenant, PERMISSIONS.ACCOUNTING_RECEIVABLES_MANAGE) || hasPermission(tenant, PERMISSIONS.ACCOUNTING_REPORTS_VIEW);
  if (!canView) return <EmptyState icon={UsersRound} title="Receivables are not available to you" description="Ask an administrator for receivables or Accounting reporting access." />;
  const customers = await getReceivablesSummary(tenant.organizationId);
  const totalOutstanding = customers.reduce((sum, customer) => sum + Number(customer.outstanding), 0);
  const totalOverdue = customers.reduce((sum, customer) => sum + Number(customer.overdue), 0);
  const money = (value: Parameters<typeof formatMoney>[0]) => formatMoney(value, tenant.organization.currency);

  return <div className="space-y-6">
    <PageHeader title="Accounts Receivable" description="Customer balances, allocated receipts, overdue exposure, and statement history." />
    <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-lg border p-4"><p className="text-sm text-muted-foreground">Customers</p><p className="text-2xl font-semibold">{customers.length}</p></div><div className="rounded-lg border p-4"><p className="text-sm text-muted-foreground">Outstanding</p><p className="text-2xl font-semibold">{money(totalOutstanding)}</p></div><div className="rounded-lg border p-4"><p className="text-sm text-muted-foreground">Overdue</p><p className="text-2xl font-semibold text-destructive">{money(totalOverdue)}</p></div></div>
    {customers.length === 0 ? <EmptyState icon={UsersRound} title="No customer balances" description="Sent invoices and allocated receipts will build customer statements here." /> : <div className="space-y-4">{customers.map((customer) => <section key={customer.key} className="rounded-lg border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">{customer.customerName}</h2><p className="text-sm text-muted-foreground">{customer.customerEmail || "No email recorded"}</p></div><div className="text-right"><p className="font-semibold">Outstanding {money(customer.outstanding)}</p>{customer.overdue.isPositive() ? <Badge variant="destructive">Overdue {money(customer.overdue)}</Badge> : <Badge variant="outline">Current</Badge>}</div></div><div className="mt-4 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="py-2">Date</th><th>Reference</th><th>Charge</th><th>Receipt</th><th>Status</th></tr></thead><tbody>{customer.invoices.map((invoice) => <tr key={invoice.id} className="border-b align-top"><td className="py-2">{invoice.issueDate.toLocaleDateString()}</td><td>{invoice.invoiceNumber}<div className="text-xs text-muted-foreground">{invoice.payments.map((payment) => `${payment.paymentDate.toLocaleDateString()} ${payment.paymentMethod.replaceAll("_", " ")}${payment.reference ? ` (${payment.reference})` : ""}`).join("; ")}</div></td><td>{money(invoice.amount)}</td><td>{money(invoice.amountPaid)}</td><td>{invoice.status}</td></tr>)}</tbody></table></div></section>)}</div>}
  </div>;
}
