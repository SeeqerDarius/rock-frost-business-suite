import Link from "next/link";
import { Stethoscope, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listHospitalEncounters, listHospitalFacilities, listHospitalPatients, listHospitalProviders, listHospitalAppointments } from "@/modules/hospital/service";
import { createEncounterAction } from "../actions";

export default async function HospitalEncountersPage() {
  const tenant = await requireModuleAccess("hospital");
  const canManage = hasPermission(tenant, PERMISSIONS.HOSPITAL_ENCOUNTERS_MANAGE);
  const [encounters, facilities, patients, providers, appointments] = await Promise.all([
    listHospitalEncounters(tenant.organizationId),
    listHospitalFacilities(tenant.organizationId),
    listHospitalPatients(tenant.organizationId),
    listHospitalProviders(tenant.organizationId),
    listHospitalAppointments(tenant.organizationId),
  ]);
  const openAppointments = appointments.filter((a) => a.status === "CHECKED_IN" && !a.encounter);
  const select = (name: string, label: string, options: [string, string][], required = true) => <div><Label htmlFor={name}>{label}</Label><select id={name} name={name} required={required} className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"><option value="">Select…</option>{options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <PageHeader title="Encounters" description="Triage, vitals, clinical notes, diagnoses, care plans, and disposition." />
        {canManage ? (
          <EntityDialog trigger={<Button size="sm"><Plus />New encounter</Button>} title="Open encounter" action={createEncounterAction}>
            {select("facilityId", "Facility", facilities.map((f) => [f.id, f.name]))}
            {select("patientId", "Patient", patients.map((p) => [p.id, `${p.mrn} · ${p.firstName} ${p.lastName}`]))}
            {select("providerId", "Provider", providers.map((p) => [p.id, p.name]))}
            {select("appointmentId", "From checked-in appointment", openAppointments.map((a) => [a.id, `${a.appointmentNumber} · ${a.patient.firstName} ${a.patient.lastName}`]), false)}
            <div><Label htmlFor="type">Type</Label><select id="type" name="type" required className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"><option value="OUTPATIENT">Outpatient</option><option value="INPATIENT">Inpatient</option><option value="EMERGENCY">Emergency</option></select></div>
            <div><Label htmlFor="chiefComplaint">Chief complaint</Label><Input id="chiefComplaint" name="chiefComplaint" /></div>
          </EntityDialog>
        ) : null}
      </div>

      {encounters.length === 0 ? (
        <EmptyState icon={Stethoscope} title="No encounters yet" description="Opened encounters will appear here." />
      ) : (
        <div className="space-y-3">
          {encounters.map((encounter) => (
            <Link key={encounter.id} href={`/app/hospital/encounters/${encounter.id}`} className="block rounded-lg border p-4 transition-colors hover:bg-muted/40">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{encounter.encounterNumber} · {encounter.patient.firstName} {encounter.patient.lastName}</p>
                  <p className="text-sm text-muted-foreground">{encounter.type} · {encounter.provider.name} · {encounter.facility.name} · opened {encounter.openedAt.toLocaleString()}</p>
                </div>
                <div className="flex gap-1">
                  <Badge variant="outline">{encounter.status}</Badge>
                  {encounter.status === "CLOSED" ? <Badge variant="outline">{encounter.disposition.replaceAll("_", " ")}</Badge> : null}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
