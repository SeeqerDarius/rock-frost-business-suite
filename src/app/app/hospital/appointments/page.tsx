import { CalendarDays, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listHospitalAppointments, listHospitalFacilities, listHospitalDepartments, listHospitalProviders, listHospitalPatients } from "@/modules/hospital/service";
import { createAppointmentAction, checkInAppointmentAction, cancelAppointmentAction, noShowAppointmentAction } from "../actions";

export default async function HospitalAppointmentsPage() {
  const tenant = await requireModuleAccess("hospital");
  const canManage = hasPermission(tenant, PERMISSIONS.HOSPITAL_APPOINTMENTS_MANAGE);
  const [appointments, facilities, departments, providers, patients] = await Promise.all([
    listHospitalAppointments(tenant.organizationId),
    listHospitalFacilities(tenant.organizationId),
    listHospitalDepartments(tenant.organizationId),
    listHospitalProviders(tenant.organizationId),
    listHospitalPatients(tenant.organizationId),
  ]);
  const select = (name: string, label: string, options: [string, string][], required = true) => <div><Label htmlFor={name}>{label}</Label><select id={name} name={name} required={required} className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"><option value="">Select…</option>{options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <PageHeader title="Appointments" description="Provider/department scheduling with conflict-free booking, check-in, and cancellation." />
        {canManage ? (
          <EntityDialog trigger={<Button size="sm"><Plus />New appointment</Button>} title="Schedule appointment" action={createAppointmentAction}>
            {select("facilityId", "Facility", facilities.map((f) => [f.id, f.name]))}
            {select("departmentId", "Department", departments.map((d) => [d.id, d.name]), false)}
            {select("providerId", "Provider", providers.map((p) => [p.id, `${p.name}${p.specialty ? ` · ${p.specialty}` : ""}`]))}
            {select("patientId", "Patient", patients.map((p) => [p.id, `${p.mrn} · ${p.firstName} ${p.lastName}`]))}
            <div className="grid gap-4 sm:grid-cols-2">
              <div><Label htmlFor="scheduledStart">Start</Label><Input id="scheduledStart" name="scheduledStart" type="datetime-local" required /></div>
              <div><Label htmlFor="scheduledEnd">End</Label><Input id="scheduledEnd" name="scheduledEnd" type="datetime-local" required /></div>
            </div>
            <div><Label htmlFor="reason">Reason</Label><Input id="reason" name="reason" required /></div>
          </EntityDialog>
        ) : null}
      </div>

      {appointments.length === 0 ? (
        <EmptyState icon={CalendarDays} title="No appointments yet" description="Scheduled appointments will appear here." />
      ) : (
        <div className="space-y-3">
          {appointments.map((appointment) => (
            <div key={appointment.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{appointment.appointmentNumber} · {appointment.patient.firstName} {appointment.patient.lastName}</p>
                  <p className="text-sm text-muted-foreground">{appointment.provider.name} · {appointment.facility.name} · {appointment.scheduledStart.toLocaleString()}–{appointment.scheduledEnd.toLocaleTimeString()}</p>
                  <p className="text-sm text-muted-foreground">{appointment.reason}</p>
                </div>
                <Badge variant="outline">{appointment.status.replaceAll("_", " ")}</Badge>
              </div>
              {canManage && appointment.status === "SCHEDULED" ? (
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <form action={checkInAppointmentAction}><input type="hidden" name="appointmentId" value={appointment.id} /><Button size="sm" type="submit">Check in</Button></form>
                  <form action={noShowAppointmentAction}><input type="hidden" name="appointmentId" value={appointment.id} /><Button size="sm" variant="outline" type="submit">No-show</Button></form>
                  <form action={cancelAppointmentAction} className="flex gap-1"><input type="hidden" name="appointmentId" value={appointment.id} /><Input name="reason" placeholder="Reason" className="h-8 w-32 text-xs" /><Button size="sm" variant="outline" type="submit">Cancel</Button></form>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
