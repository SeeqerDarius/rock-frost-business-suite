import { FileCheck2, Plus } from "lucide-react";
import { EmptyState } from "@/components/feedback/empty-state";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listOrders, listSupplierInvoices } from "@/modules/procurement/service";
import { createInvoiceAction, reviewInvoiceAction } from "./actions";

const ERRORS: Record<string, string> = { forbidden: "You do not have permission for that invoice action.", invalid: "Review the invoice values and try again.", match: "The invoice exceeds received quantities or contains an invalid line.", "not-found": "The purchase order could not be found.", approval: "The invoice cannot be reviewed by this user or still has a matching exception." };

export default async function ProcurementInvoicesPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { saved, error } = await searchParams;
  const tenant = await requireModuleAccess("procurement");
  const canManage = hasPermission(tenant, PERMISSIONS.PROCUREMENT_INVOICES_MANAGE);
  const canApprove = hasPermission(tenant, PERMISSIONS.PROCUREMENT_INVOICES_APPROVE);
  const [invoices, orders] = await Promise.all([listSupplierInvoices(tenant.organizationId), listOrders(tenant.organizationId)]);
  const receivableOrders = orders.filter((order) => order.lines.some((line) => line.receivedQuantity > 0));
  const today = new Date().toISOString().slice(0, 10);
  return <div className="space-y-6"><div className="flex flex-wrap items-start justify-between gap-3"><PageHeader title="Supplier Invoices" description="Match vendor invoices to purchase orders and received quantities before approval." />{canManage ? <div className="flex flex-wrap gap-2">{receivableOrders.map((order) => <EntityDialog key={order.id} trigger={<Button size="sm" variant="outline"><Plus />{order.orderNumber}</Button>} title={`Invoice for ${order.orderNumber}`} action={createInvoiceAction} submitLabel="Create invoice"><input type="hidden" name="vendorId" value={order.vendorId} /><input type="hidden" name="orderId" value={order.id} /><input type="hidden" name="linesJson" value={JSON.stringify(order.lines.filter((line) => line.receivedQuantity > 0).map((line) => ({ orderLineId: line.id, quantity: line.receivedQuantity, unitCost: line.unitCost.toString() })))} /><div className="space-y-2"><Label htmlFor={`number-${order.id}`}>Vendor invoice number</Label><Input id={`number-${order.id}`} name="invoiceNumber" required /></div><div className="space-y-2"><Label htmlFor={`date-${order.id}`}>Invoice date</Label><Input id={`date-${order.id}`} name="invoiceDate" type="date" defaultValue={today} required /></div><div className="rounded-md bg-muted p-3 text-sm">{order.lines.filter((line) => line.receivedQuantity > 0).map((line) => <p key={line.id}>{line.description}: {line.receivedQuantity} at {Number(line.unitCost).toFixed(2)}</p>)}</div></EntityDialog>)}</div> : null}</div>
    {saved ? <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">Saved.</p> : null}{error && ERRORS[error] ? <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{ERRORS[error]}</p> : null}
    {invoices.length === 0 ? <EmptyState icon={FileCheck2} title="No supplier invoices" description="Create an invoice from a purchase order with received quantities." /> : <div className="space-y-3">{invoices.map((invoice) => <section key={invoice.id} className="rounded-lg border p-4"><div className="flex flex-wrap justify-between gap-3"><div><p className="font-semibold">{invoice.invoiceNumber}</p><p className="text-sm text-muted-foreground">{invoice.vendor.name}, {invoice.order.orderNumber}</p></div><div className="flex items-center gap-2"><Badge variant={invoice.status === "EXCEPTION" || invoice.status === "REJECTED" ? "destructive" : "outline"}>{invoice.status}</Badge><span className="font-medium">{Number(invoice.totalAmount).toFixed(2)}</span></div></div>{invoice.exceptionNote ? <p className="mt-2 text-sm text-destructive">{invoice.exceptionNote}</p> : null}{canApprove && (invoice.status === "MATCHED" || invoice.status === "EXCEPTION") ? <div className="mt-3 flex gap-2">{invoice.status === "MATCHED" ? <form action={reviewInvoiceAction}><input type="hidden" name="invoiceId" value={invoice.id} /><input type="hidden" name="decision" value="APPROVE" /><Button size="sm" type="submit">Approve</Button></form> : null}<form action={reviewInvoiceAction}><input type="hidden" name="invoiceId" value={invoice.id} /><input type="hidden" name="decision" value="REJECT" /><Button size="sm" variant="destructive" type="submit">Reject</Button></form></div> : null}</section>)}</div>}
  </div>;
}
