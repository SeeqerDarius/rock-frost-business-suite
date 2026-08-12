import { BedDouble, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listHospitalAdmissions, listHospitalFacilities, listHospitalPatients, listHospitalProviders, listHospitalBeds, listHospitalEncounters } from "@/modules/hospital/service";
import { admitPatientAction, transferBedAction, dischargePatientAction } from "../actions";

export default async function HospitalAdmissionsPage() {
  const tenant = await requireModuleAccess("hospital");
  const canManage = hasPermission(tenant, PERMISSIONS.HOSPITAL_ADMISSIONS_MANAGE);
  const [admissions, facilities, patients, providers, beds, encounters] = await Promise.all([
    listHospitalAdmissions(tenant.organizationId),
    listHospitalFacilities(tenant.organizationId),
    listHospitalPatients(tenant.organizationId),
    listHospitalProviders(tenant.organizationId),
    listHospitalBeds(tenant.organizationId),
    listHospitalEncounters(tenant.organizationId),
  ]);
  const availableBeds = beds.filter((b) => b.status === "AVAILABLE");
  const openEncounters = encounters.filter((e) => e.status === "OPEN" && !e.admission);
  const select = (name: string, label: string, options: [string, string][], required = true) => <div><Label htmlFor={name}>{label}</Label><select id={name} name={name} required={required} className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"><option value="">Select…</option>{options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <PageHeader title="Admissions &amp; Beds" description="Ward and bed occupancy, admissions, transfers, and discharge." />
        {canManage ? (
          <EntityDialog trigger={<Button size="sm"><Plus />Admit patient</Button>} title="Admit patient" action={admitPatientAction}>
            {select("facilityId", "Facility", facilities.map((f) => [f.id, f.name]))}
            {select("patientId", "Patient", patients.map((p) => [p.id, `${p.mrn} · ${p.firstName} ${p.lastName}`]))}
            {select("encounterId", "Open encounter", openEncounters.map((e) => [e.id, `${e.encounterNumber} · ${e.patient.firstName} ${e.patient.lastName}`]))}
            {select("admittingProviderId", "Admitting provider", providers.map((p) => [p.id, p.name]))}
            {select("bedId", "Bed", availableBeds.map((b) => [b.id, `${b.ward.name} · ${b.code}`]))}
            <div><Label htmlFor="expectedDischargeDate">Expected discharge (optional)</Label><Input id="expectedDischargeDate" name="expectedDischargeDate" type="date" /></div>
          </EntityDialog>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border p-4"><p className="text-sm text-muted-foreground">Total beds</p><p className="text-2xl font-semibold">{beds.length}</p></div>
        <div className="rounded-lg border p-4"><p className="text-sm text-muted-foreground">Occupied</p><p className="text-2xl font-semibold">{beds.filter((b) => b.status === "OCCUPIED").length}</p></div>
        <div className="rounded-lg border p-4"><p className="text-sm text-muted-foreground">Available</p><p className="text-2xl font-semibold">{availableBeds.length}</p></div>
      </div>

      {admissions.length === 0 ? (
        <EmptyState icon={BedDouble} title="No admissions yet" description="Admitted patients will appear here." />
      ) : (
        <div className="space-y-3">
          {admissions.map((admission) => (
            <div key={admission.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{admission.admissionNumber} · {admission.patient.firstName} {admission.patient.lastName}</p>
                  <p className="text-sm text-muted-foreground">{admission.bed.ward.name} · Bed {admission.bed.code} · admitted {admission.admittedAt.toLocaleString()} · Dr. {admission.admittingProvider.name}</p>
                </div>
                <Badge variant="outline">{admission.status}</Badge>
              </div>
              {canManage && admission.status === "ADMITTED" ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <form action={transferBedAction} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="admissionId" value={admission.id} />
                    <select name="toBedId" required className="h-8 rounded-md border bg-transparent px-2 text-xs"><option value="">Transfer to bed…</option>{availableBeds.map((b) => <option key={b.id} value={b.id}>{b.ward.name} · {b.code}</option>)}</select>
                    <Input name="reason" placeholder="Reason" className="h-8 w-32 text-xs" />
                    <Button size="sm" variant="outline" type="submit">Transfer</Button>
                  </form>
                  <form action={dischargePatientAction} className="flex items-end gap-2">
                    <input type="hidden" name="admissionId" value={admission.id} />
                    <Input name="dischargeSummary" placeholder="Discharge summary" className="h-8 w-48 text-xs" />
                    <Button size="sm" type="submit">Discharge</Button>
                  </form>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
