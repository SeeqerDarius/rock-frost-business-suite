import { Receipt, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listHospitalInvoices, listHospitalFacilities, listHospitalPatients } from "@/modules/hospital/service";
import { createInvoiceAction, recordPaymentAction, voidInvoiceAction, createInsuranceClaimAction } from "../actions";

export default async function HospitalBillingPage() {
  const tenant = await requireModuleAccess("hospital");
  const canManage = hasPermission(tenant, PERMISSIONS.HOSPITAL_BILLING_MANAGE);
  const [invoices, facilities, patients] = await Promise.all([
    listHospitalInvoices(tenant.organizationId),
    listHospitalFacilities(tenant.organizationId),
    listHospitalPatients(tenant.organizationId),
  ]);
  const select = (name: string, label: string, options: [string, string][], required = true) => <div><Label htmlFor={name}>{label}</Label><select id={name} name={name} required={required} className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"><option value="">Select…</option>{options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <PageHeader title="Billing &amp; Claims" description="Service charges, invoices, payments, outstanding balances, and insurance claims." />
        {canManage ? (
          <EntityDialog trigger={<Button size="sm"><Plus />New invoice</Button>} title="Create invoice" action={createInvoiceAction}>
            {select("facilityId", "Facility", facilities.map((f) => [f.id, f.name]))}
            {select("patientId", "Patient", patients.map((p) => [p.id, `${p.mrn} · ${p.firstName} ${p.lastName}`]))}
            <div className="space-y-2">
              <Label>Line items</Label>
              {[0, 1, 2].map((i) => (
                <div key={i} className="grid grid-cols-3 gap-2">
                  <Input name="lineDescription" placeholder="Description" />
                  <Input name="lineQuantity" placeholder="Qty" type="number" defaultValue={i === 0 ? "1" : undefined} />
                  <Input name="lineUnitPrice" placeholder="Unit price" type="number" step="0.01" />
                </div>
              ))}
            </div>
          </EntityDialog>
        ) : null}
      </div>

      {invoices.length === 0 ? (
        <EmptyState icon={Receipt} title="No invoices yet" description="Patient invoices will appear here." />
      ) : (
        <div className="space-y-3">
          {invoices.map((invoice) => {
            const paid = invoice.payments.filter((p) => !p.refundedAt).reduce((sum, p) => sum + Number(p.amount), 0);
            const balance = Number(invoice.total) - paid;
            return (
              <div key={invoice.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{invoice.invoiceNumber} · {invoice.patient.firstName} {invoice.patient.lastName}</p>
                    <p className="text-sm text-muted-foreground">Total {Number(invoice.total).toFixed(2)} · Paid {paid.toFixed(2)} · Balance {balance.toFixed(2)} · issued {invoice.issuedAt.toLocaleDateString()}</p>
                  </div>
                  <Badge variant="outline">{invoice.status.replaceAll("_", " ")}</Badge>
                </div>
                {invoice.insuranceClaims.length > 0 ? (
                  <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {invoice.insuranceClaims.map((claim) => <p key={claim.id}>Claim: {claim.insurerName} · {claim.policyNumber} · {claim.status}</p>)}
                  </div>
                ) : null}
                {canManage && invoice.status !== "VOID" ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {balance > 0 ? (
                      <form action={recordPaymentAction} className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="invoiceId" value={invoice.id} />
                        <Input name="amount" type="number" step="0.01" placeholder="Amount" required className="h-8 w-24 text-xs" />
                        <select name="method" className="h-8 rounded-md border bg-transparent px-2 text-xs"><option value="CASH">Cash</option><option value="CARD">Card</option><option value="MOBILE_MONEY">Mobile money</option><option value="BANK_TRANSFER">Bank transfer</option><option value="INSURANCE">Insurance</option><option value="OTHER">Other</option></select>
                        <Input name="reference" placeholder="Reference" className="h-8 w-24 text-xs" />
                        <Button size="sm" type="submit">Record payment</Button>
                      </form>
                    ) : null}
                    {invoice.status === "OPEN" && paid === 0 ? (
                      <form action={voidInvoiceAction} className="flex items-end gap-2"><input type="hidden" name="invoiceId" value={invoice.id} /><Input name="reason" placeholder="Void reason" className="h-8 w-32 text-xs" /><Button size="sm" variant="outline" type="submit">Void</Button></form>
                    ) : null}
                    <form action={createInsuranceClaimAction} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="invoiceId" value={invoice.id} />
                      <input type="hidden" name="patientId" value={invoice.patientId} />
                      <Input name="insurerName" placeholder="Insurer" className="h-8 w-32 text-xs" />
                      <Input name="policyNumber" placeholder="Policy #" className="h-8 w-28 text-xs" />
                      <Button size="sm" variant="outline" type="submit">File claim</Button>
                    </form>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
