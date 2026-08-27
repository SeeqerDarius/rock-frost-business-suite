import { FileText, Plus } from "lucide-react";
import { Fragment } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/currency";
import { listAccounts, listInvoices } from "@/modules/accounting/service";
import { listTaxCodes } from "@/modules/accounting/tax-service";
import { createNewInvoice, sendInvoice, payInvoice, voidExistingInvoice } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage invoices.",
  "missing-fields": "All required fields must be filled in.",
  "invalid-state": "That action isn't valid for this invoice's current status.",
  "has-payment": "Cannot void an invoice that has already received payment.",
  "invalid-payment": "That payment amount is invalid or exceeds the remaining balance.",
  "not-found": "That invoice could not be found.",
  "period-closed": "The transaction date is in a closed accounting period.",
};

const STATUS_BADGE: Record<string, "default" | "outline" | "destructive" | "secondary"> = {
  DRAFT: "outline",
  SENT: "secondary",
  PAID: "default",
  OVERDUE: "destructive",
  VOID: "outline",
};

export default async function AccountingInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const tenant = await requireModuleAccess("accounting");
  const canManage = hasPermission(tenant, PERMISSIONS.ACCOUNTING_INVOICES_MANAGE);
  const money = (value: Parameters<typeof formatMoney>[0]) => formatMoney(value, tenant.organization.currency);
  const canReceive = hasPermission(tenant, PERMISSIONS.ACCOUNTING_RECEIVABLES_MANAGE);
  const [invoices, accounts, taxCodes] = await Promise.all([listInvoices(tenant.organizationId), listAccounts(tenant.organizationId), listTaxCodes(tenant.organizationId)]);
  const receivingAccounts = accounts.filter((account) => account.active && account.liquidityType !== "NONE");
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader title="Invoices" description="Amounts owed to your organization by customers." />
        {canManage ? (
          <EntityDialog trigger={<Button size="sm"><Plus />New invoice</Button>} title="New invoice" action={createNewInvoice}>
            <div className="space-y-2">
              <Label htmlFor="customerName">Customer name</Label>
              <Input id="customerName" name="customerName" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customerEmail">Customer email</Label>
              <Input id="customerEmail" name="customerEmail" type="email" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
              <Label htmlFor="amount">Taxable amount ({tenant.organization.currency})</Label>
                <Input id="amount" name="amount" type="number" step="0.01" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="issueDate">Issue date</Label>
                <Input id="issueDate" name="issueDate" type="date" defaultValue={today} required />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="taxCodeId">Tax treatment</Label>
              <select id="taxCodeId" name="taxCodeId" className="h-10 w-full rounded-md border bg-background px-3">
                <option value="">No tax</option>
                {taxCodes.filter((taxCode) => taxCode.active).map((taxCode) => <option key={taxCode.id} value={taxCode.id}>{taxCode.code}: {taxCode.name} ({Number(taxCode.vatRate) + Number(taxCode.nhilRate) + Number(taxCode.getfundRate)}%)</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dueDate">Due date</Label>
              <Input id="dueDate" name="dueDate" type="date" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" name="description" rows={3} />
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

      {invoices.length === 0 ? (
        <EmptyState icon={FileText} title="No invoices yet" description="Invoices you create will appear here." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Number</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Amount ({tenant.organization.currency})</TableHead>
              <TableHead>Paid ({tenant.organization.currency})</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Status</TableHead>
              {canManage || canReceive ? <TableHead /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((invoice) => (
              <Fragment key={invoice.id}><TableRow>
                <TableCell className="font-mono text-xs">{invoice.invoiceNumber}</TableCell>
                <TableCell className="font-medium">{invoice.customerName}</TableCell>
                <TableCell className="text-muted-foreground"><div>{money(invoice.amount)}</div>{invoice.taxCode ? <div className="text-xs">Tax {money(Number(invoice.vatAmount) + Number(invoice.nhilAmount) + Number(invoice.getfundAmount))} ({invoice.taxCode.code})</div> : null}</TableCell>
                <TableCell className="text-muted-foreground">{money(invoice.amountPaid)}</TableCell>
                <TableCell className="text-muted-foreground">{invoice.dueDate.toLocaleDateString()}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_BADGE[invoice.status]}>{invoice.status}</Badge>
                </TableCell>
                {canManage || canReceive ? (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {canManage && invoice.status === "DRAFT" ? (
                        <form action={sendInvoice}>
                          <input type="hidden" name="id" value={invoice.id} />
                          <Button type="submit" size="sm" variant="ghost">Send</Button>
                        </form>
                      ) : null}
                      {canReceive && (invoice.status === "SENT" || invoice.status === "OVERDUE") ? (
                        <EntityDialog
                          trigger={<Button size="sm" variant="ghost">Record payment</Button>}
                          title={`Record payment for ${invoice.invoiceNumber}`}
                          action={payInvoice}
                          submitLabel="Record payment"
                        >
                          <input type="hidden" name="id" value={invoice.id} />
                          <div className="space-y-2">
                            <Label htmlFor={`pay-amount-${invoice.id}`}>Amount ({tenant.organization.currency})</Label>
                            <Input
                              id={`pay-amount-${invoice.id}`}
                              name="amount"
                              type="number"
                              step="0.01"
                              defaultValue={(Number(invoice.amount) - Number(invoice.amountPaid)).toFixed(2)}
                              required
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`pay-date-${invoice.id}`}>Payment date</Label>
                            <Input id={`pay-date-${invoice.id}`} name="paymentDate" type="date" defaultValue={today} required />
                          </div>
                          <div className="space-y-2"><Label htmlFor={`pay-method-${invoice.id}`}>Payment method</Label><select id={`pay-method-${invoice.id}`} name="paymentMethod" className="h-10 w-full rounded-md border bg-background px-3"><option value="BANK_TRANSFER">Bank transfer</option><option value="CASH">Cash</option><option value="MOBILE_MONEY">Mobile money</option><option value="CARD">Card</option><option value="CHEQUE">Cheque</option><option value="OTHER">Other</option></select></div>
                          <div className="space-y-2"><Label htmlFor={`pay-account-${invoice.id}`}>Receiving account</Label><select id={`pay-account-${invoice.id}`} name="accountId" className="h-10 w-full rounded-md border bg-background px-3" required>{receivingAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} {account.name}</option>)}</select></div>
                          <div className="space-y-2"><Label htmlFor={`pay-reference-${invoice.id}`}>Reference</Label><Input id={`pay-reference-${invoice.id}`} name="reference" /></div>
                          <div className="space-y-2"><Label htmlFor={`pay-notes-${invoice.id}`}>Notes</Label><Textarea id={`pay-notes-${invoice.id}`} name="notes" rows={2} /></div>
                        </EntityDialog>
                      ) : null}
                      {canManage && invoice.status === "DRAFT" ? (
                        <form action={voidExistingInvoice}>
                          <input type="hidden" name="id" value={invoice.id} />
                          <Button type="submit" size="sm" variant="ghost">Void</Button>
                        </form>
                      ) : null}
                    </div>
                  </TableCell>
                ) : null}
              </TableRow>
              {invoice.payments.length ? <TableRow><TableCell colSpan={7} className="bg-muted/30"><div className="space-y-1 text-xs"><p className="font-medium">Receipt history</p>{invoice.payments.map((payment) => <p key={payment.id} className="text-muted-foreground">{payment.paymentDate.toLocaleDateString()}: {money(payment.amount)} via {payment.paymentMethod.replaceAll("_", " ")} into {payment.account.name}{payment.reference ? `, reference ${payment.reference}` : ""}</p>)}</div></TableCell></TableRow> : null}</Fragment>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
