import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getHospitalEncounter, listHospitalReferrals } from "@/modules/hospital/service";
import { recordVitalsAction, addClinicalNoteAction, signClinicalNoteAction, addDiagnosisAction, addCarePlanAction, closeEncounterAction, createReferralAction, updateReferralStatusAction } from "../../actions";

export default async function HospitalEncounterDetailPage({ params }: { params: Promise<{ encounterId: string }> }) {
  const { encounterId } = await params;
  const tenant = await requireModuleAccess("hospital");
  const canManage = hasPermission(tenant, PERMISSIONS.HOSPITAL_ENCOUNTERS_MANAGE);
  const encounter = await getHospitalEncounter(tenant.organizationId, encounterId);
  if (!encounter) notFound();
  const referrals = (await listHospitalReferrals(tenant.organizationId)).filter((r) => r.encounterId === encounterId);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <PageHeader title={`Encounter ${encounter.encounterNumber}`} description={`${encounter.patient.firstName} ${encounter.patient.lastName} · ${encounter.type} · ${encounter.provider.name}`} />
        <div className="flex gap-1">
          <Badge variant="outline">{encounter.status}</Badge>
          {encounter.status === "CLOSED" ? <Badge variant="outline">{encounter.disposition.replaceAll("_", " ")}</Badge> : null}
        </div>
      </div>

      {encounter.admission ? (
        <Card><CardHeader><CardTitle className="text-base">Admission</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">Bed {encounter.admission.bed.ward.name} / {encounter.admission.bed.code} · status {encounter.admission.status}</CardContent></Card>
      ) : null}

      <Card>
        <CardHeader><CardTitle className="text-base">Vitals</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {encounter.vitals.length === 0 ? <p className="text-sm text-muted-foreground">No vitals recorded yet.</p> : (
            <div className="space-y-2">
              {encounter.vitals.map((v) => (
                <div key={v.id} className="rounded-md border p-2 text-xs text-muted-foreground">
                  {v.recordedAt.toLocaleString()} — Temp {v.temperatureC?.toString() ?? "—"}°C · Pulse {v.pulseBpm ?? "—"} · RR {v.respiratoryRate ?? "—"} · BP {v.bloodPressureSystolic ?? "—"}/{v.bloodPressureDiastolic ?? "—"} · SpO2 {v.spo2 ?? "—"}%
                </div>
              ))}
            </div>
          )}
          {canManage && encounter.status === "OPEN" ? (
            <form action={recordVitalsAction} className="grid gap-2 sm:grid-cols-4">
              <input type="hidden" name="encounterId" value={encounter.id} />
              <Input name="temperatureC" placeholder="Temp °C" step="0.1" />
              <Input name="pulseBpm" placeholder="Pulse bpm" />
              <Input name="respiratoryRate" placeholder="RR" />
              <Input name="spo2" placeholder="SpO2 %" />
              <Input name="bloodPressureSystolic" placeholder="BP systolic" />
              <Input name="bloodPressureDiastolic" placeholder="BP diastolic" />
              <Input name="weightKg" placeholder="Weight kg" step="0.1" />
              <Input name="heightCm" placeholder="Height cm" step="0.1" />
              <Button size="sm" type="submit" className="sm:col-span-4">Record vitals</Button>
            </form>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Clinical notes</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {encounter.clinicalNotes.length === 0 ? <p className="text-sm text-muted-foreground">No notes yet.</p> : (
            <div className="space-y-2">
              {encounter.clinicalNotes.map((note) => (
                <div key={note.id} className="rounded-md border p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="outline">{note.type}</Badge>
                    <span className="text-xs text-muted-foreground">{note.createdAt.toLocaleString()}{note.signedAt ? " · signed" : ""}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{note.content}</p>
                  {canManage && !note.signedAt ? (
                    <form action={signClinicalNoteAction} className="mt-2"><input type="hidden" name="encounterId" value={encounter.id} /><input type="hidden" name="noteId" value={note.id} /><Button size="sm" variant="outline" type="submit">Sign note</Button></form>
                  ) : null}
                </div>
              ))}
            </div>
          )}
          {canManage ? (
            <form action={addClinicalNoteAction} className="space-y-2">
              <input type="hidden" name="encounterId" value={encounter.id} />
              <select name="type" className="h-9 rounded-md border bg-transparent px-3 text-sm"><option value="PROGRESS">Progress</option><option value="TRIAGE">Triage</option><option value="DISCHARGE_SUMMARY">Discharge summary</option><option value="ADDENDUM">Addendum</option></select>
              <textarea name="content" required rows={3} className="w-full rounded-md border bg-transparent p-2 text-sm" placeholder="Note content" />
              <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="sign" className="size-4" />Sign immediately (becomes read-only)</label>
              <Button size="sm" type="submit">Add note</Button>
            </form>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Diagnoses</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {encounter.diagnoses.length === 0 ? <p className="text-sm text-muted-foreground">No diagnoses recorded.</p> : (
            <ul className="space-y-1 text-sm text-muted-foreground">{encounter.diagnoses.map((d) => <li key={d.id}>{d.type}: {d.description}{d.code ? ` (${d.code})` : ""}</li>)}</ul>
          )}
          {canManage ? (
            <form action={addDiagnosisAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="encounterId" value={encounter.id} />
              <select name="type" className="h-8 rounded-md border bg-transparent px-2 text-xs"><option value="PRIMARY">Primary</option><option value="SECONDARY">Secondary</option></select>
              <Input name="code" placeholder="Code (optional)" className="h-8 w-28 text-xs" />
              <Input name="description" placeholder="Description" required className="h-8 w-64 text-xs" />
              <Button size="sm" type="submit">Add diagnosis</Button>
            </form>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Care plan</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {encounter.carePlans.length === 0 ? <p className="text-sm text-muted-foreground">No care plan entries.</p> : (
            <ul className="space-y-1 text-sm text-muted-foreground">{encounter.carePlans.map((c) => <li key={c.id}>{c.goal}{c.followUpDate ? ` · follow-up ${c.followUpDate.toLocaleDateString()}` : ""}</li>)}</ul>
          )}
          {canManage ? (
            <form action={addCarePlanAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="encounterId" value={encounter.id} />
              <Input name="goal" placeholder="Goal" required className="h-8 w-64 text-xs" />
              <Input name="followUpDate" type="date" className="h-8 text-xs" />
              <Button size="sm" type="submit">Add care plan entry</Button>
            </form>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Referrals</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {referrals.length === 0 ? <p className="text-sm text-muted-foreground">No referrals.</p> : (
            <div className="space-y-2">
              {referrals.map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded-md border p-2 text-xs">
                  <span>{r.referredToFacility} — {r.reason} ({r.status})</span>
                  {canManage && r.status === "PENDING" ? (
                    <form action={updateReferralStatusAction}><input type="hidden" name="encounterId" value={encounter.id} /><input type="hidden" name="referralId" value={r.id} /><input type="hidden" name="status" value="ACCEPTED" /><Button size="sm" variant="outline" type="submit">Mark accepted</Button></form>
                  ) : null}
                </div>
              ))}
            </div>
          )}
          {canManage ? (
            <form action={createReferralAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="encounterId" value={encounter.id} />
              <input type="hidden" name="patientId" value={encounter.patientId} />
              <Input name="referredToFacility" placeholder="Referred to" required className="h-8 w-48 text-xs" />
              <Input name="reason" placeholder="Reason" required className="h-8 w-48 text-xs" />
              <Button size="sm" type="submit">Create referral</Button>
            </form>
          ) : null}
        </CardContent>
      </Card>

      {canManage && encounter.status === "OPEN" ? (
        <Card>
          <CardHeader><CardTitle className="text-base">Close encounter</CardTitle></CardHeader>
          <CardContent>
            <form action={closeEncounterAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="encounterId" value={encounter.id} />
              <div><Label htmlFor="disposition">Disposition</Label><select id="disposition" name="disposition" required className="h-9 rounded-md border bg-transparent px-3 text-sm"><option value="DISCHARGED_HOME">Discharged home</option><option value="ADMITTED">Admitted</option><option value="REFERRED">Referred</option><option value="TRANSFERRED">Transferred</option><option value="DECEASED">Deceased</option></select></div>
              <Button type="submit">Close encounter</Button>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
