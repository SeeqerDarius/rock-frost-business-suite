import { ClipboardList, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listHospitalNursingTasks, listHospitalPatients, listHospitalEncounters } from "@/modules/hospital/service";
import { createNursingTaskAction, updateNursingTaskStatusAction } from "../actions";

export default async function HospitalNursingPage() {
  const tenant = await requireModuleAccess("hospital");
  const canManage = hasPermission(tenant, PERMISSIONS.HOSPITAL_NURSING_MANAGE);
  const [tasks, patients, encounters] = await Promise.all([
    listHospitalNursingTasks(tenant.organizationId),
    listHospitalPatients(tenant.organizationId),
    listHospitalEncounters(tenant.organizationId),
  ]);
  const select = (name: string, label: string, options: [string, string][], required = true) => <div><Label htmlFor={name}>{label}</Label><select id={name} name={name} required={required} className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"><option value="">Select…</option>{options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <PageHeader title="Nursing" description="Nursing observations and tasks across patients and encounters." />
        {canManage ? (
          <EntityDialog trigger={<Button size="sm"><Plus />New task</Button>} title="Create nursing task" action={createNursingTaskAction}>
            {select("patientId", "Patient", patients.map((p) => [p.id, `${p.mrn} · ${p.firstName} ${p.lastName}`]))}
            {select("encounterId", "Encounter (optional)", encounters.filter((e) => e.status === "OPEN").map((e) => [e.id, e.encounterNumber]), false)}
            <div><Label htmlFor="description">Description</Label><Input id="description" name="description" required /></div>
            <div><Label htmlFor="dueAt">Due</Label><Input id="dueAt" name="dueAt" type="datetime-local" /></div>
          </EntityDialog>
        ) : null}
      </div>

      {tasks.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No nursing tasks yet" description="Nursing tasks will appear here." />
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <div key={task.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{task.description}</p>
                  <p className="text-sm text-muted-foreground">{task.patient.firstName} {task.patient.lastName}{task.dueAt ? ` · due ${task.dueAt.toLocaleString()}` : ""}</p>
                </div>
                <Badge variant="outline">{task.status.replaceAll("_", " ")}</Badge>
              </div>
              {canManage && task.status !== "COMPLETED" && task.status !== "CANCELLED" ? (
                <div className="mt-3 flex gap-2">
                  <form action={updateNursingTaskStatusAction}><input type="hidden" name="taskId" value={task.id} /><input type="hidden" name="status" value="IN_PROGRESS" /><Button size="sm" variant="outline" type="submit">Start</Button></form>
                  <form action={updateNursingTaskStatusAction}><input type="hidden" name="taskId" value={task.id} /><input type="hidden" name="status" value="COMPLETED" /><Button size="sm" type="submit">Complete</Button></form>
                  <form action={updateNursingTaskStatusAction}><input type="hidden" name="taskId" value={task.id} /><input type="hidden" name="status" value="CANCELLED" /><Button size="sm" variant="outline" type="submit">Cancel</Button></form>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
