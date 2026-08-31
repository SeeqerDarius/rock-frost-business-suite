import { FileMinus2, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { LineItemsEditor } from "@/components/forms/line-items-editor";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/currency";
import { listAccounts, listCreditNotes, listInvoices, listContacts } from "@/modules/accounting/service";
import { listTaxCodes } from "@/modules/accounting/tax-service";
import { createNewCreditNote, applyCreditNote, refundExistingCreditNote, voidExistingCreditNote } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage credit notes.",
  "missing-fields": "All required fields must be filled in.",
  "invalid-lines": "Every line needs a description, a quantity greater than zero, and a non-negative unit price.",
  "invalid-state": "That action isn't valid for this credit note's current status.",
  "invalid-payment": "Select an active cash, bank, or mobile-money account owned by this organization.",
  "not-found": "That credit note or invoice could not be found.",
  "period-closed": "The transaction date is in a closed accounting period.",
};

const STATUS_BADGE: Record<string, "default" | "outline" | "destructive" | "secondary"> = {
  DRAFT: "outline",
  APPLIED: "default",
  REFUNDED: "default",
  VOID: "outline",
};

export default async function AccountingCreditNotesPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const tenant = await requireModuleAccess("accounting");
  const canManage = hasPermission(tenant, PERMISSIONS.ACCOUNTING_RECEIVABLES_MANAGE);
  const currency = tenant.organization.currency ?? "GHS";
  const money = (value: Parameters<typeof formatMoney>[0]) => formatMoney(value, currency);
  const [creditNotes, invoices, accounts, taxCodes, contacts] = await Promise.all([
    listCreditNotes(tenant.organizationId),
    listInvoices(tenant.organizationId),
    listAccounts(tenant.organizationId),
    listTaxCodes(tenant.organizationId),
    listContacts(tenant.organizationId),
  ]);
  const openInvoices = invoices.filter((invoice) => invoice.status === "SENT" || invoice.status === "OVERDUE");
  const refundAccounts = accounts.filter((account) => account.active && account.liquidityType !== "NONE");
  const customerContacts = contacts.filter((contact) => contact.type === "CUSTOMER" || contact.type === "BOTH");
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader title="Credit Notes" description="Issue a customer credit note, then apply it to reduce an invoice's balance or settle it as a cash refund." />
        {canManage ? (
          <EntityDialog trigger={<Button size="sm"><Plus />New credit note</Button>} title="New credit note" action={createNewCreditNote} contentClassName="sm:max-w-2xl">
            {customerContacts.length > 0 ? (
              <div className="space-y-2">
                <Label htmlFor="contactId">Contact (optional)</Label>
                <select id="contactId" name="contactId" className="h-10 w-full rounded-md border bg-background px-3">
                  <option value="">Enter details manually</option>
                  {customerContacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}
                </select>
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="customerName">Customer name</Label>
              <Input id="customerName" name="customerName" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customerEmail">Customer email</Label>
              <Input id="customerEmail" name="customerEmail" type="email" />
            </div>
            <LineItemsEditor currency={currency} />
            <div className="space-y-2">
              <Label htmlFor="issueDate">Issue date</Label>
              <Input id="issueDate" name="issueDate" type="date" defaultValue={today} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="taxCodeId">Tax treatment</Label>
              <select id="taxCodeId" name="taxCodeId" className="h-10 w-full rounded-md border bg-background px-3">
                <option value="">No tax</option>
                {taxCodes.filter((taxCode) => taxCode.active).map((taxCode) => <option key={taxCode.id} value={taxCode.id}>{taxCode.code}: {taxCode.name} ({Number(taxCode.vatRate) + Number(taxCode.nhilRate) + Number(taxCode.getfundRate)}%)</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" name="description" rows={2} />
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

      {creditNotes.length === 0 ? (
        <EmptyState icon={FileMinus2} title="No credit notes yet" description="Credit notes you issue will appear here." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Number</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Amount ({currency})</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Applied to</TableHead>
              {canManage ? <TableHead /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {creditNotes.map((creditNote) => (
              <TableRow key={creditNote.id}>
                <TableCell className="font-mono text-xs">{creditNote.creditNoteNumber}</TableCell>
                <TableCell className="font-medium">{creditNote.customerName}</TableCell>
                <TableCell className="text-muted-foreground">{money(creditNote.amount)}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_BADGE[creditNote.status]}>{creditNote.status}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{creditNote.invoice ? creditNote.invoice.invoiceNumber : "-"}</TableCell>
                {canManage ? (
                  <TableCell className="text-right">
                    {creditNote.status === "DRAFT" ? (
                      <div className="flex justify-end gap-1">
                        <EntityDialog
                          trigger={<Button size="sm" variant="ghost">Apply to invoice</Button>}
                          title={`Apply ${creditNote.creditNoteNumber} to an invoice`}
                          description="Reduces the selected invoice's outstanding balance by this credit note's full amount."
                          action={applyCreditNote}
                          submitLabel="Apply"
                        >
                          <input type="hidden" name="id" value={creditNote.id} />
                          <div className="space-y-2">
                            <Label htmlFor={`apply-invoice-${creditNote.id}`}>Invoice</Label>
                            <select id={`apply-invoice-${creditNote.id}`} name="invoiceId" className="h-10 w-full rounded-md border bg-background px-3" required>
                              {openInvoices.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.invoiceNumber} - {invoice.customerName} ({money(Number(invoice.amount) - Number(invoice.amountPaid) - Number(invoice.amountCredited))} outstanding)</option>)}
                            </select>
                          </div>
                        </EntityDialog>
                        <EntityDialog
                          trigger={<Button size="sm" variant="ghost">Refund</Button>}
                          title={`Refund ${creditNote.creditNoteNumber}`}
                          description="Pays the customer real cash instead of applying the credit to an invoice."
                          action={refundExistingCreditNote}
                          submitLabel="Record refund"
                        >
                          <input type="hidden" name="id" value={creditNote.id} />
                          <div className="space-y-2">
                            <Label htmlFor={`refund-account-${creditNote.id}`}>Refund from account</Label>
                            <select id={`refund-account-${creditNote.id}`} name="accountId" className="h-10 w-full rounded-md border bg-background px-3" required>
                              {refundAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} {account.name}</option>)}
                            </select>
                          </div>
                        </EntityDialog>
                        <form action={voidExistingCreditNote}>
                          <input type="hidden" name="id" value={creditNote.id} />
                          <Button type="submit" size="sm" variant="ghost">Void</Button>
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
