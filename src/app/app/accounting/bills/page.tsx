import { FileSpreadsheet, Plus, Printer } from "lucide-react";
import { Fragment } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { LineItemsEditor } from "@/components/forms/line-items-editor";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { createOrganizationFormatter } from "@/lib/org-format";
import { ContactSelect } from "@/components/forms/contact-select";
import { CurrencyFields, SettlementRateField } from "@/components/forms/currency-fields";
import { baseTotal } from "@/modules/accounting/multi-currency";
import { listAccounts, listBills, listContacts, listAccountingAttachmentsByType } from "@/modules/accounting/service";
import { listTaxCodes } from "@/modules/accounting/tax-service";
import { listApplicableRules } from "@/modules/tax/service";
import { db } from "@/lib/db";
import { createNewBill, approveExistingBill, payBill, voidExistingBill, uploadBillAttachment, deleteBillAttachmentAction } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage bills.",
  "missing-fields": "All required fields must be filled in.",
  "invalid-lines": "Every line needs a description, a quantity greater than zero, and a non-negative unit price.",
  "invalid-state": "That action isn't valid for this bill's current status.",
  "has-payment": "Cannot void a bill that has already received a payment.",
  "invalid-payment": "That payment amount is invalid or exceeds the remaining balance.",
  "not-found": "That bill, expense account, or contact could not be found.",
  "period-closed": "The transaction date is in a closed accounting period.",
  "tax-rule": "That tax rule could not be applied on the document date. Check its rates and effective dates in Tax and Compliance. Rules on individual lines also need a tax rule on the document.",
  "fx-rate": "No exchange rate is recorded for that currency and date. Record one under Exchange Rates or enter a rate.",
  "missing-file": "Choose a file to attach.",
  "invalid-attachment": "That file must be a JPEG, PNG, WEBP, or PDF under 3 MB.",
};

const STATUS_BADGE: Record<string, "default" | "outline" | "destructive" | "secondary"> = {
  DRAFT: "outline",
  APPROVED: "secondary",
  PARTIALLY_PAID: "secondary",
  PAID: "default",
  VOID: "outline",
};

export default async function AccountingBillsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const tenant = await requireModuleAccess("accounting");
  const canManage = hasPermission(tenant, PERMISSIONS.ACCOUNTING_BILLS_MANAGE);
  const canPay = hasPermission(tenant, PERMISSIONS.ACCOUNTING_PAYABLES_MANAGE);
  const format = createOrganizationFormatter(tenant.organization);
  const currency = format.presentation.currency;
  const money = (value: Parameters<typeof format.money>[0], documentCurrency?: string | null) => format.money(value, documentCurrency ?? currency);
  const [bills, accounts, taxCodes, contacts, attachments] = await Promise.all([listBills(tenant.organizationId), listAccounts(tenant.organizationId), listTaxCodes(tenant.organizationId), listContacts(tenant.organizationId), listAccountingAttachmentsByType(tenant.organizationId, "BILL")]);
  const [taxRules, pricing] = await Promise.all([listApplicableRules(tenant.organizationId), db.organization.findUnique({ where: { id: tenant.organizationId }, select: { pricesIncludeTax: true } })]);
  const pricesIncludeTax = pricing?.pricesIncludeTax ?? false;
  const attachmentsByBillId = new Map<string, typeof attachments>();
  for (const attachment of attachments) {
    const list = attachmentsByBillId.get(attachment.entityId) ?? [];
    list.push(attachment);
    attachmentsByBillId.set(attachment.entityId, list);
  }
  const payingAccounts = accounts.filter((account) => account.active && account.liquidityType !== "NONE");
  const expenseAccounts = accounts.filter((account) => account.active && account.type === "EXPENSE");
  const supplierContacts = contacts.filter((contact) => contact.type === "SUPPLIER" || contact.type === "BOTH");
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader title="Bills" description="Amounts your organization owes to suppliers, without going through a purchase order." />
        {canManage ? (
          <EntityDialog trigger={<Button size="sm"><Plus />New bill</Button>} title="New bill" action={createNewBill} contentClassName="sm:max-w-2xl">
            {supplierContacts.length > 0 ? (
              <div className="space-y-2">
                <Label htmlFor="contactId">Contact (optional)</Label>
                <ContactSelect contacts={supplierContacts.map((contact) => ({ id: contact.id, name: contact.name, currency: contact.currency }))} currencyFieldId="bill-currency" />
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="supplierName">Supplier name</Label>
              <Input id="supplierName" name="supplierName" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supplierEmail">Supplier email</Label>
              <Input id="supplierEmail" name="supplierEmail" type="email" />
            </div>
            <CurrencyFields baseCurrency={currency} idPrefix="bill" />
            <LineItemsEditor currency={currency} taxRules={taxRules.map((rule) => ({ id: rule.id, label: `${rule.code}: ${rule.name}` }))} />
            <div className="space-y-2">
              <Label htmlFor="expenseAccountId">Expense account</Label>
              <select id="expenseAccountId" name="expenseAccountId" className="h-10 w-full rounded-md border bg-background px-3" required>
                {expenseAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} {account.name}</option>)}
              </select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="billDate">Bill date</Label>
                <Input id="billDate" name="billDate" type="date" defaultValue={today} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dueDate">Due date</Label>
                <Input id="dueDate" name="dueDate" type="date" required />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="taxCodeId">Tax treatment</Label>
              <select id="taxCodeId" name="taxCodeId" className="h-10 w-full rounded-md border bg-background px-3">
                <option value="">No tax</option>
                {taxRules.length ? (
                  <optgroup label="Tax rules">
                    {taxRules.map((rule) => <option key={rule.id} value={`rule:${rule.id}`}>{rule.code}: {rule.name}</option>)}
                  </optgroup>
                ) : null}
                <optgroup label="Tax codes">
                  {taxCodes.filter((taxCode) => taxCode.active).map((taxCode) => <option key={taxCode.id} value={taxCode.id}>{taxCode.code}: {taxCode.name} ({Number(taxCode.vatRate) + Number(taxCode.nhilRate) + Number(taxCode.getfundRate)}%)</option>)}
                </optgroup>
              </select>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="pricesIncludeTax" defaultChecked={pricesIncludeTax} className="size-4" />Line prices include tax (applies to tax rules)</label>
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

      {expenseAccounts.length === 0 && canManage ? (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
          No active expense accounts exist yet. Create one in Chart of Accounts before recording a bill.
        </div>
      ) : null}

      {bills.length === 0 ? (
        <EmptyState icon={FileSpreadsheet} title="No bills yet" description="Bills you record will appear here." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Number</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Paid</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Status</TableHead>
              {canManage || canPay ? <TableHead /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {bills.map((bill) => (
              <Fragment key={bill.id}><TableRow>
                <TableCell className="font-mono text-xs">{bill.billNumber}</TableCell>
                <TableCell className="font-medium">
                  {bill.supplierName}
                  {bill.lines.length > 0 ? (
                    <details className="mt-1 text-xs font-normal text-muted-foreground">
                      <summary className="cursor-pointer">{bill.lines.length} line{bill.lines.length === 1 ? "" : "s"}</summary>
                      <div className="mt-1 space-y-0.5">
                        {bill.lines.map((line) => <p key={line.id}>{line.description}: {Number(line.quantity)} x {money(line.unitPrice, bill.currency)} = {money(line.lineTotal, bill.currency)}</p>)}
                      </div>
                    </details>
                  ) : null}
                </TableCell>
                <TableCell className="text-muted-foreground"><div>{money(bill.amount, bill.currency)}</div>{bill.currency && bill.currency !== currency ? <div className="text-xs">{money(baseTotal(bill))} at {format.number(bill.exchangeRate.toString(), { maximumFractionDigits: 6 })}</div> : null}{bill.taxAmount.greaterThan(0) ? <div className="text-xs">Tax {money(bill.taxAmount, bill.currency)}{bill.taxCode ? ` (${bill.taxCode.code})` : bill.taxTreatment ? " (tax rule)" : ""}</div> : null}</TableCell>
                <TableCell className="text-muted-foreground">{money(bill.amountPaid, bill.currency)}</TableCell>
                <TableCell className="text-muted-foreground">{format.date(bill.dueDate)}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_BADGE[bill.status]}>{bill.status.replaceAll("_", " ")}</Badge>
                </TableCell>
                {canManage || canPay ? (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <a href={`/api/accounting/documents/bill?id=${bill.id}`} target="_blank" rel="noreferrer" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
                        <Printer />
                        Print
                      </a>
                      {canManage && bill.status === "DRAFT" ? (
                        <form action={approveExistingBill}>
                          <input type="hidden" name="id" value={bill.id} />
                          <Button type="submit" size="sm" variant="ghost">Approve</Button>
                        </form>
                      ) : null}
                      {canPay && (bill.status === "APPROVED" || bill.status === "PARTIALLY_PAID") ? (
                        <EntityDialog
                          trigger={<Button size="sm" variant="ghost">Record payment</Button>}
                          title={`Record payment for ${bill.billNumber}`}
                          action={payBill}
                          submitLabel="Record payment"
                        >
                          <input type="hidden" name="id" value={bill.id} />
                          <div className="space-y-2">
                            <Label htmlFor={`bill-pay-amount-${bill.id}`}>Amount ({bill.currency ?? currency})</Label>
                            <Input id={`bill-pay-amount-${bill.id}`} name="amount" type="number" step="0.01" defaultValue={(Number(bill.amount) - Number(bill.amountPaid)).toFixed(2)} required />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`bill-pay-date-${bill.id}`}>Payment date</Label>
                            <Input id={`bill-pay-date-${bill.id}`} name="paymentDate" type="date" defaultValue={today} required />
                          </div>
                          <div className="space-y-2"><Label htmlFor={`bill-pay-method-${bill.id}`}>Payment method</Label><select id={`bill-pay-method-${bill.id}`} name="paymentMethod" className="h-10 w-full rounded-md border bg-background px-3"><option value="BANK_TRANSFER">Bank transfer</option><option value="CASH">Cash</option><option value="MOBILE_MONEY">Mobile money</option><option value="CARD">Card</option><option value="CHEQUE">Cheque</option><option value="OTHER">Other</option></select></div>
                          {bill.currency && bill.currency !== currency ? <SettlementRateField id={`bill-pay-rate-${bill.id}`} currency={bill.currency} baseCurrency={currency} /> : null}
                          <div className="space-y-2"><Label htmlFor={`bill-pay-account-${bill.id}`}>Paying account</Label><select id={`bill-pay-account-${bill.id}`} name="accountId" className="h-10 w-full rounded-md border bg-background px-3" required>{payingAccounts.filter((account) => !account.currency || account.currency === currency || account.currency === bill.currency).map((account) => <option key={account.id} value={account.id}>{account.code} {account.name}{account.currency && account.currency !== currency ? ` (${account.currency})` : ""}</option>)}</select></div>
                          <div className="space-y-2"><Label htmlFor={`bill-pay-reference-${bill.id}`}>Reference</Label><Input id={`bill-pay-reference-${bill.id}`} name="reference" /></div>
                          <div className="space-y-2"><Label htmlFor={`bill-pay-notes-${bill.id}`}>Notes</Label><Textarea id={`bill-pay-notes-${bill.id}`} name="notes" rows={2} /></div>
                        </EntityDialog>
                      ) : null}
                      {canManage && bill.status === "DRAFT" ? (
                        <form action={voidExistingBill}>
                          <input type="hidden" name="id" value={bill.id} />
                          <Button type="submit" size="sm" variant="ghost">Void</Button>
                        </form>
                      ) : null}
                    </div>
                  </TableCell>
                ) : null}
              </TableRow>
              {bill.payments.length ? <TableRow><TableCell colSpan={7} className="bg-muted/30"><div className="space-y-1 text-xs"><p className="font-medium">Payment history</p>{bill.payments.map((payment) => <p key={payment.id} className="text-muted-foreground">{format.date(payment.paymentDate)}: {money(payment.amount, bill.currency)}{Number(payment.realizedFxAmount) !== 0 ? ` (realized FX ${Number(payment.realizedFxAmount) > 0 ? "gain" : "loss"} ${money(payment.realizedFxAmount.abs())})` : ""} via {payment.paymentMethod.replaceAll("_", " ")} from {payment.account.name}{payment.reference ? `, reference ${payment.reference}` : ""}{Number(payment.withholdingTaxAmount) > 0 ? ` (includes ${money(payment.withholdingTaxAmount, bill.currency)} withheld)` : ""}</p>)}</div></TableCell></TableRow> : null}
              <TableRow><TableCell colSpan={7} className="bg-muted/30">
                <div className="space-y-1 text-xs">
                  <p className="font-medium">Attachments</p>
                  {(attachmentsByBillId.get(bill.id) ?? []).map((attachment) => (
                    <div key={attachment.id} className="flex items-center justify-between text-muted-foreground">
                      <a href={attachment.fileAsset.url ?? "#"} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                        {attachment.fileAsset.fileName}{attachment.caption ? ` - ${attachment.caption}` : ""}
                      </a>
                      {canManage ? (
                        <form action={deleteBillAttachmentAction}>
                          <input type="hidden" name="id" value={attachment.id} />
                          <Button type="submit" size="sm" variant="ghost">Remove</Button>
                        </form>
                      ) : null}
                    </div>
                  ))}
                  {(attachmentsByBillId.get(bill.id) ?? []).length === 0 ? <p className="text-muted-foreground">None yet.</p> : null}
                  {canManage ? (
                    <EntityDialog trigger={<Button size="sm" variant="outline">Attach file</Button>} title={`Attach a file to ${bill.billNumber}`} description="JPEG, PNG, WEBP, or PDF, up to 3 MB." action={uploadBillAttachment}>
                      <input type="hidden" name="billId" value={bill.id} />
                      <Input type="file" name="file" accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf" required />
                      <div className="space-y-2"><Label htmlFor={`bill-attachment-caption-${bill.id}`}>Caption</Label><Input id={`bill-attachment-caption-${bill.id}`} name="caption" placeholder="Optional" /></div>
                    </EntityDialog>
                  ) : null}
                </div>
              </TableCell></TableRow>
              </Fragment>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
