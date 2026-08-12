import { Users, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listHospitalPatients, listHospitalClinicalAlerts, listHospitalConsents } from "@/modules/hospital/service";
import { createPatientAction, createClinicalAlertAction, resolveClinicalAlertAction, createConsentAction, revokeConsentAction } from "../actions";

export default async function HospitalPatientsPage() {
  const tenant = await requireModuleAccess("hospital");
  const canManage = hasPermission(tenant, PERMISSIONS.HOSPITAL_PATIENTS_MANAGE);
  const [patients, alerts, consents] = await Promise.all([
    listHospitalPatients(tenant.organizationId),
    listHospitalClinicalAlerts(tenant.organizationId),
    listHospitalConsents(tenant.organizationId),
  ]);
  const alertsByPatient = new Map<string, typeof alerts>();
  for (const alert of alerts) alertsByPatient.set(alert.patientId, [...(alertsByPatient.get(alert.patientId) ?? []), alert]);
  const consentsByPatient = new Map<string, typeof consents>();
  for (const consent of consents) consentsByPatient.set(consent.patientId, [...(consentsByPatient.get(consent.patientId) ?? []), consent]);

  const field = (name: string, label: string, type = "text", required = true) => <div><Label htmlFor={name}>{label}</Label><Input id={name} name={name} type={type} required={required} /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <PageHeader title="Patients" description="Registration, demographics, contacts, allergies, alerts, and consent." />
        {canManage ? (
          <EntityDialog trigger={<Button size="sm"><Plus />New patient</Button>} title="Register patient" description="Duplicate names/dates of birth are flagged for review at the front desk, never blocked automatically." action={createPatientAction}>
            <div className="grid gap-4 sm:grid-cols-2">
              {field("firstName", "First name")}
              {field("lastName", "Last name")}
              {field("dateOfBirth", "Date of birth", "date")}
              <div><Label htmlFor="sex">Sex</Label><select id="sex" name="sex" required className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"><option value="">Select…</option><option value="MALE">Male</option><option value="FEMALE">Female</option><option value="OTHER">Other</option></select></div>
              {field("phone", "Phone", "text", false)}
              {field("email", "Email", "email", false)}
              {field("bloodGroup", "Blood group", "text", false)}
              {field("nationalIdNumber", "National ID number", "text", false)}
            </div>
            <div><Label htmlFor="address">Address</Label><Input id="address" name="address" /></div>
            <div><Label htmlFor="allergies">Allergies</Label><Input id="allergies" name="allergies" placeholder="e.g. Penicillin, peanuts" /></div>
            <div className="grid gap-4 sm:grid-cols-3">
              {field("nextOfKinName", "Next of kin name", "text", false)}
              {field("nextOfKinPhone", "Next of kin phone", "text", false)}
              {field("nextOfKinRelationship", "Relationship", "text", false)}
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {field("emergencyContactName", "Emergency contact", "text", false)}
              {field("emergencyContactPhone", "Emergency phone", "text", false)}
              {field("emergencyContactRelation", "Relationship", "text", false)}
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="consentOnFile" className="size-4" />Signed general consent already on file</label>
          </EntityDialog>
        ) : null}
      </div>

      {patients.length === 0 ? (
        <EmptyState icon={Users} title="No patients registered yet" description="Registered patients will appear here with their MRN, demographics, and clinical alerts." />
      ) : (
        <div className="space-y-3">
          {patients.map((patient) => {
            const patientAlerts = alertsByPatient.get(patient.id) ?? [];
            const patientConsents = consentsByPatient.get(patient.id) ?? [];
            return (
              <div key={patient.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{patient.mrn} · {patient.firstName} {patient.lastName}</p>
                    <p className="text-sm text-muted-foreground">{patient.sex} · DOB {patient.dateOfBirth.toLocaleDateString()} · {patient.phone ?? "No phone on file"}</p>
                    {patient.allergies ? <p className="mt-1 text-sm text-amber-600 dark:text-amber-400">Allergies: {patient.allergies}</p> : null}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="outline">{patient.status}</Badge>
                    {patientAlerts.map((alert) => <Badge key={alert.id} variant="outline" className="border-destructive/40 text-destructive">{alert.type}</Badge>)}
                  </div>
                </div>
                {canManage ? (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Alerts &amp; consent</summary>
                    <div className="mt-3 space-y-3">
                      {patientAlerts.length > 0 ? (
                        <div className="space-y-2">
                          {patientAlerts.map((alert) => (
                            <div key={alert.id} className="flex items-center justify-between rounded-md border p-2 text-xs">
                              <span>{alert.type}: {alert.description} ({alert.severity})</span>
                              <form action={resolveClinicalAlertAction}><input type="hidden" name="alertId" value={alert.id} /><Button size="sm" variant="outline" type="submit">Resolve</Button></form>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      <form action={createClinicalAlertAction} className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="patientId" value={patient.id} />
                        <div><Label className="text-xs">Type</Label><Input name="type" className="h-8 w-32 text-xs" placeholder="Fall risk" required /></div>
                        <div><Label className="text-xs">Description</Label><Input name="description" className="h-8 w-48 text-xs" required /></div>
                        <select name="severity" className="h-8 rounded-md border bg-transparent px-2 text-xs"><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="CRITICAL">Critical</option></select>
                        <Button size="sm" type="submit">Add alert</Button>
                      </form>
                      {patientConsents.length > 0 ? (
                        <div className="space-y-2">
                          {patientConsents.map((consent) => (
                            <div key={consent.id} className="flex items-center justify-between rounded-md border p-2 text-xs">
                              <span>{consent.type} · {consent.description} · signed by {consent.consentedByName} on {consent.consentedAt.toLocaleDateString()}{consent.revokedAt ? " (revoked)" : ""}</span>
                              {!consent.revokedAt ? <form action={revokeConsentAction}><input type="hidden" name="consentId" value={consent.id} /><Button size="sm" variant="outline" type="submit">Revoke</Button></form> : null}
                            </div>
                          ))}
                        </div>
                      ) : null}
                      <form action={createConsentAction} className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="patientId" value={patient.id} />
                        <select name="type" className="h-8 rounded-md border bg-transparent px-2 text-xs"><option value="TREATMENT">Treatment</option><option value="PROCEDURE">Procedure</option><option value="DATA_SHARING">Data sharing</option><option value="OTHER">Other</option></select>
                        <div><Label className="text-xs">Description</Label><Input name="description" className="h-8 w-48 text-xs" required /></div>
                        <div><Label className="text-xs">Consented by</Label><Input name="consentedByName" className="h-8 w-40 text-xs" required /></div>
                        <Button size="sm" type="submit">Record consent</Button>
                      </form>
                    </div>
                  </details>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
