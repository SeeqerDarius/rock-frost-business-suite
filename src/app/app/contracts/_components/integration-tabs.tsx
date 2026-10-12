import Link from "next/link";
import { Gauge, Link2, Plus, ReceiptText, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/feedback/empty-state";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LINK_TARGETS, type getBillingSchedule, type getContractLinks, type getContractRisk, type listBillableDocuments, type listLinkTargetOptions } from "@/modules/contracts/integrations";
import { addBillingLineAction, addLinkAction, cancelBillingLineAction, generateBillingPlanAction, markBillingLineInvoicedAction, removeLinkAction } from "../actions";
import { humanize, RiskBadge, SELECT_CLASS } from "./shared";

type Links = Awaited<ReturnType<typeof getContractLinks>>;
type LinkOptions = Awaited<ReturnType<typeof listLinkTargetOptions>>;
type Billing = Awaited<ReturnType<typeof getBillingSchedule>>;
type Billable = Awaited<ReturnType<typeof listBillableDocuments>>;
type Risk = Awaited<ReturnType<typeof getContractRisk>>;

export function LinksTab({ contractId, links, options, canUpdate, formatDate, formatMoney }: { contractId: string; links: Links; options: LinkOptions; canUpdate: boolean; formatDate: (value: Date) => string; formatMoney: (value: string, currency: string) => string }) {
  const available = Object.entries(options).filter(([, rows]) => rows && rows.length) as [keyof typeof LINK_TARGETS, { id: string; label: string }[]][];
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div><CardTitle>Linked records</CardTitle><CardDescription>Records in other modules this contract relates to: Accounting contacts, invoices, and bills; Fleet vehicles, drivers, owners, and Work and Pay agreements; employees; and projects. Links are relationships only and never change the linked record. You see details only for modules you can access.</CardDescription></div>
        {canUpdate && available.length ? (
          <EntityDialog trigger={<Button size="sm"><Plus />Link record</Button>} title="Link a record" action={addLinkAction} submitLabel="Link">
            <input type="hidden" name="contractId" value={contractId} />
            <div className="space-y-1.5">
              <Label htmlFor="link-target" required>Record</Label>
              <select id="link-target" name="target" className={SELECT_CLASS} required>
                {available.map(([type, rows]) => <optgroup key={type} label={LINK_TARGETS[type].label}>{rows.map((row) => <option key={row.id} value={`${type}:${row.id}`}>{row.label}</option>)}</optgroup>)}
              </select>
              <p className="text-xs text-muted-foreground">The most recent 200 records of each kind are listed.</p>
            </div>
          </EntityDialog>
        ) : null}
      </CardHeader>
      <CardContent>
        {links.length === 0 ? <EmptyState icon={Link2} title="No linked records" description="Link the customer or supplier, invoices and bills, vehicles, or employees this contract covers." /> : (
          <Table>
            <TableHeader><TableRow><TableHead>Record</TableHead><TableHead>Kind</TableHead><TableHead>Details</TableHead><TableHead>Linked</TableHead>{canUpdate ? <TableHead /> : null}</TableRow></TableHeader>
            <TableBody>{links.map((link) => (
              <TableRow key={link.id}>
                <TableCell className="font-medium">{link.href ? <Link href={link.href} className="hover:underline">{link.label}</Link> : link.label}{link.missing ? <div className="text-xs text-destructive">No longer available</div> : null}</TableCell>
                <TableCell className="text-sm">{link.typeLabel}</TableCell>
                <TableCell className="text-sm">
                  {link.detail ?? (link.visible ? "-" : "Requires access to that module")}
                  {link.financial ? <div className="text-xs text-muted-foreground">{formatMoney(link.financial.amount, link.financial.currency ?? "")} · paid {formatMoney(link.financial.paid, link.financial.currency ?? "")} · {humanize(link.financial.status)}</div> : null}
                </TableCell>
                <TableCell className="text-sm">{formatDate(link.createdAt)}</TableCell>
                {canUpdate ? <TableCell className="text-right"><form action={removeLinkAction}><input type="hidden" name="contractId" value={contractId} /><input type="hidden" name="linkId" value={link.id} /><Button type="submit" size="sm" variant="ghost" aria-label={`Remove link to ${link.label}`}><Trash2 /></Button></form></TableCell> : null}
              </TableRow>
            ))}</TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

const FREQUENCIES = [{ months: 1, label: "Monthly" }, { months: 3, label: "Quarterly" }, { months: 6, label: "Every six months" }, { months: 12, label: "Yearly" }];

export function BillingTab({ contractId, status, hasExpiration, billing, billable, canUpdate, formatDate, formatMoney }: { contractId: string; status: string; hasExpiration: boolean; billing: Billing; billable: Billable; canUpdate: boolean; formatDate: (value: Date) => string; formatMoney: (value: string, currency: string) => string }) {
  const plannable = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "ACTIVE"].includes(status);
  const currency = billing.currency;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {(["RECEIVABLE", "PAYABLE"] as const).map((direction) => (
          <Card key={direction}>
            <CardHeader className="pb-2"><CardTitle className="text-base">{direction === "RECEIVABLE" ? "To invoice" : "To be billed"}</CardTitle><CardDescription>In {currency}.</CardDescription></CardHeader>
            <CardContent className="grid grid-cols-2 gap-2 text-sm">
              <div><div className="text-muted-foreground">Planned</div><div className="text-lg font-semibold tabular-nums">{formatMoney(billing.totals[direction].planned, currency)}</div></div>
              <div><div className="text-muted-foreground">Invoiced</div><div className="text-lg font-semibold tabular-nums">{formatMoney(billing.totals[direction].invoiced, currency)}</div></div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div><CardTitle>Billing schedule</CardTitle><CardDescription>A plan of what this contract should invoice or be billed, in the contract currency. Planning never creates invoices, bills, or journal entries: raise the document in Accounting, then link it here to mark the line invoiced.</CardDescription></div>
          {canUpdate && plannable ? (
            <div className="flex flex-wrap gap-2">
              <EntityDialog trigger={<Button size="sm"><Plus />Plan billing</Button>} title="Plan recurring billing" description={hasExpiration ? "Lines are created from the first due date until the contract's expiration date." : "This contract has no expiration date, so enter how many periods to plan."} action={generateBillingPlanAction} submitLabel="Create plan">
                <input type="hidden" name="contractId" value={contractId} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5"><Label htmlFor="plan-direction">Direction</Label><select id="plan-direction" name="direction" className={SELECT_CLASS}><option value="RECEIVABLE">We invoice the counterparty</option><option value="PAYABLE">The counterparty bills us</option></select></div>
                  <div className="space-y-1.5"><Label htmlFor="plan-frequency">Frequency</Label><select id="plan-frequency" name="frequencyMonths" className={SELECT_CLASS} defaultValue="1">{FREQUENCIES.map((frequency) => <option key={frequency.months} value={frequency.months}>{frequency.label}</option>)}</select></div>
                  <div className="space-y-1.5"><Label htmlFor="plan-amount" required>Amount per period ({currency})</Label><Input id="plan-amount" name="amount" inputMode="decimal" required /></div>
                  <div className="space-y-1.5"><Label htmlFor="plan-first" required>First due date</Label><Input id="plan-first" name="firstDueDate" type="date" required /></div>
                  {hasExpiration ? null : <div className="space-y-1.5"><Label htmlFor="plan-periods" required>Number of periods</Label><Input id="plan-periods" name="periods" type="number" min={1} max={120} required /></div>}
                </div>
                <div className="space-y-1.5"><Label htmlFor="plan-description" required>Description</Label><Input id="plan-description" name="description" required placeholder="For example: monthly vehicle lease fee" /></div>
              </EntityDialog>
              <EntityDialog trigger={<Button size="sm" variant="outline">Add line</Button>} title="Add a billing line" action={addBillingLineAction} submitLabel="Add">
                <input type="hidden" name="contractId" value={contractId} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5"><Label htmlFor="line-direction">Direction</Label><select id="line-direction" name="direction" className={SELECT_CLASS}><option value="RECEIVABLE">To invoice</option><option value="PAYABLE">To be billed</option></select></div>
                  <div className="space-y-1.5"><Label htmlFor="line-due" required>Due date</Label><Input id="line-due" name="dueDate" type="date" required /></div>
                  <div className="space-y-1.5"><Label htmlFor="line-amount" required>Amount ({currency})</Label><Input id="line-amount" name="amount" inputMode="decimal" required /></div>
                </div>
                <div className="space-y-1.5"><Label htmlFor="line-description" required>Description</Label><Input id="line-description" name="description" required /></div>
              </EntityDialog>
            </div>
          ) : null}
        </CardHeader>
        <CardContent>
          {billing.lines.length === 0 ? <EmptyState icon={ReceiptText} title="No billing planned" description="Plan the invoices or bills this contract should produce." /> : (
            <Table>
              <TableHeader><TableRow><TableHead>Due</TableHead><TableHead>Description</TableHead><TableHead>Direction</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead><TableHead>Document</TableHead>{canUpdate ? <TableHead /> : null}</TableRow></TableHeader>
              <TableBody>{billing.lines.map((line) => {
                const documents = line.direction === "RECEIVABLE" ? billable.invoices : billable.bills;
                return (
                  <TableRow key={line.id} className={line.status === "CANCELLED" ? "text-muted-foreground" : ""}>
                    <TableCell className="text-sm">{formatDate(line.dueDate)}</TableCell>
                    <TableCell className="text-sm">{line.description}{line.cancelReason ? <div className="text-xs">Cancelled: {line.cancelReason}</div> : null}</TableCell>
                    <TableCell className="text-sm">{line.direction === "RECEIVABLE" ? "To invoice" : "To be billed"}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(line.amount.toFixed(2), line.currency)}</TableCell>
                    <TableCell><Badge variant={line.status === "INVOICED" ? "default" : "outline"}>{humanize(line.status)}</Badge></TableCell>
                    <TableCell className="text-sm">{line.document ? <>{line.document.label}{line.document.financial ? <div className="text-xs text-muted-foreground">{humanize(line.document.financial.status)}, paid {formatMoney(line.document.financial.paid, line.currency)}</div> : null}</> : "-"}</TableCell>
                    {canUpdate ? (
                      <TableCell>
                        {line.status === "PLANNED" ? (
                          <div className="flex justify-end gap-1">
                            <EntityDialog trigger={<Button size="sm" variant="ghost">Mark invoiced</Button>} title={`Link the ${line.direction === "RECEIVABLE" ? "invoice" : "bill"} for this line`} description={`Issued ${line.direction === "RECEIVABLE" ? "invoices" : "bills"} in ${line.currency} that are not yet tied to a billing line.`} action={markBillingLineInvoicedAction} submitLabel="Mark invoiced">
                              <input type="hidden" name="contractId" value={contractId} />
                              <input type="hidden" name="lineId" value={line.id} />
                              {documents.length ? (
                                <div className="space-y-1.5"><Label htmlFor={`doc-${line.id}`} required>{line.direction === "RECEIVABLE" ? "Invoice" : "Bill"}</Label><select id={`doc-${line.id}`} name="documentId" className={SELECT_CLASS} required>{documents.map((document) => <option key={document.id} value={document.id}>{document.label}</option>)}</select></div>
                              ) : <p className="text-sm text-muted-foreground">No issued {line.direction === "RECEIVABLE" ? "invoices" : "bills"} in {line.currency} are available. Raise one in Accounting first.</p>}
                            </EntityDialog>
                            <EntityDialog trigger={<Button size="sm" variant="ghost">Cancel</Button>} title="Cancel this billing line" action={cancelBillingLineAction} submitLabel="Cancel line">
                              <input type="hidden" name="contractId" value={contractId} />
                              <input type="hidden" name="lineId" value={line.id} />
                              <div className="space-y-1.5"><Label htmlFor={`cancel-${line.id}`} required>Reason</Label><Input id={`cancel-${line.id}`} name="reason" required /></div>
                            </EntityDialog>
                          </div>
                        ) : null}
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}</TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function RiskCard({ risk, assigned }: { risk: Risk; assigned: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div><CardTitle className="flex items-center gap-2"><Gauge className="size-4" />Calculated risk</CardTitle><CardDescription>Guidance from your organization&apos;s risk settings. It does not change the assigned risk ({humanize(assigned).toLowerCase()}).</CardDescription></div>
        <div className="text-right"><div className="text-2xl font-semibold tabular-nums">{risk.score}</div><RiskBadge level={risk.band} /></div>
      </CardHeader>
      <CardContent>
        {risk.factors.length ? <ul className="space-y-1 text-sm">{risk.factors.map((factor) => <li key={factor.key} className="flex justify-between gap-3"><span>{factor.label}</span><span className="tabular-nums text-muted-foreground">+{factor.points}</span></li>)}</ul> : <p className="text-sm text-muted-foreground">No risk factors apply.</p>}
      </CardContent>
    </Card>
  );
}
