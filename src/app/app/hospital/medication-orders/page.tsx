import { Pill, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listHospitalMedicationOrders, listHospitalEncounters, listHospitalPatients } from "@/modules/hospital/service";
import { createMedicationOrderAction, sendToPharmacyAction, cancelMedicationOrderAction } from "../actions";

export default async function HospitalMedicationOrdersPage() {
  const tenant = await requireModuleAccess("hospital");
  const canManage = hasPermission(tenant, PERMISSIONS.HOSPITAL_MEDICATIONS_MANAGE);
  const [orders, encounters, patients] = await Promise.all([
    listHospitalMedicationOrders(tenant.organizationId),
    listHospitalEncounters(tenant.organizationId),
    listHospitalPatients(tenant.organizationId),
  ]);
  const select = (name: string, label: string, options: [string, string][], required = true) => <div><Label htmlFor={name}>{label}</Label><select id={name} name={name} required={required} className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"><option value="">Select…</option>{options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <PageHeader title="Medication Orders" description="Prescriptions on the Hospital-owned medication-order contract — dispensing happens in Pharmacy." />
        {canManage ? (
          <EntityDialog trigger={<Button size="sm"><Plus />New order</Button>} title="Order medication" action={createMedicationOrderAction}>
            {select("encounterId", "Encounter", encounters.filter((e) => e.status === "OPEN").map((e) => [e.id, `${e.encounterNumber} · ${e.patient.firstName} ${e.patient.lastName}`]))}
            {select("patientId", "Patient", patients.map((p) => [p.id, `${p.mrn} · ${p.firstName} ${p.lastName}`]))}
            <div><Label htmlFor="medicationName">Medication</Label><Input id="medicationName" name="medicationName" required /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><Label htmlFor="strength">Strength</Label><Input id="strength" name="strength" /></div>
              <div><Label htmlFor="route">Route</Label><Input id="route" name="route" placeholder="Oral, IV, IM…" /></div>
              <div><Label htmlFor="dose">Dose</Label><Input id="dose" name="dose" required /></div>
              <div><Label htmlFor="frequency">Frequency</Label><Input id="frequency" name="frequency" required /></div>
              <div><Label htmlFor="durationDays">Duration (days)</Label><Input id="durationDays" name="durationDays" type="number" /></div>
            </div>
            <div><Label htmlFor="instructions">Instructions</Label><Input id="instructions" name="instructions" /></div>
          </EntityDialog>
        ) : null}
      </div>

      {orders.length === 0 ? (
        <EmptyState icon={Pill} title="No medication orders yet" description="Prescribed medication orders will appear here." />
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <div key={order.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{order.medicationName}{order.strength ? ` ${order.strength}` : ""} · {order.patient.firstName} {order.patient.lastName}</p>
                  <p className="text-sm text-muted-foreground">{order.dose} · {order.frequency}{order.durationDays ? ` · ${order.durationDays} days` : ""}{order.route ? ` · ${order.route}` : ""}</p>
                  {order.externalDispenseReference ? <p className="text-xs text-muted-foreground">Pharmacy reference: {order.externalDispenseReference}</p> : null}
                </div>
                <Badge variant="outline">{order.status.replaceAll("_", " ")}</Badge>
              </div>
              {canManage && order.status === "ORDERED" ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <form action={sendToPharmacyAction} className="flex items-end gap-2"><input type="hidden" name="orderId" value={order.id} /><Input name="externalDispenseReference" placeholder="Pharmacy reference (optional)" className="h-8 w-48 text-xs" /><Button size="sm" type="submit">Send to pharmacy</Button></form>
                  <form action={cancelMedicationOrderAction} className="flex items-end gap-2"><input type="hidden" name="orderId" value={order.id} /><Input name="reason" placeholder="Reason" className="h-8 w-32 text-xs" /><Button size="sm" variant="outline" type="submit">Cancel</Button></form>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
