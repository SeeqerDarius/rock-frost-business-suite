import { Users, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listHostelAllocations, listHostelRooms } from "@/modules/hostel/service";
import { listSchoolStudents, getSchoolAcademicSetup } from "@/modules/school/service";
import { createAllocationAction, endAllocationAction } from "../actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage hostel allocations.",
  invalid: "All required fields must be filled in correctly.",
  "not-found": "That student, bed, or academic year could not be found.",
  "state-already-allocated": "This student already has an active hostel allocation.",
  "state-bed-unavailable": "That bed is no longer available - someone else may have just claimed it.",
};

export default async function HostelAllocationsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { saved, error } = await searchParams;
  const tenant = await requireModuleAccess("hostel");
  const canManage = hasPermission(tenant, PERMISSIONS.HOSTEL_ALLOCATIONS_MANAGE);
  const [allocations, rooms, students, [academicYears]] = await Promise.all([
    listHostelAllocations(tenant.organizationId),
    listHostelRooms(tenant.organizationId),
    listSchoolStudents(tenant.organizationId),
    getSchoolAcademicSetup(tenant.organizationId),
  ]);

  const availableBeds = rooms.flatMap((room) =>
    room.beds.filter((bed) => bed.status === "AVAILABLE").map((bed) => ({ value: bed.id, label: `${room.building.name} · Room ${room.roomNumber} · Bed ${bed.label}` })),
  );
  const studentOptions = students.filter((s) => s.status === "ACTIVE").map((s) => ({ value: s.id, label: `${s.lastName}, ${s.firstName} (${s.admissionNumber})` }));
  const yearOptions = academicYears.map((y) => ({ value: y.id, label: y.name }));
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader title="Allocations" description="Which student is in which bed, for the current academic year." />
        {canManage ? (
          <EntityDialog trigger={<Button size="sm"><Plus />New allocation</Button>} title="Allocate a student to a bed" action={createAllocationAction}>
            <div className="space-y-2">
              <Label htmlFor="studentId">Student</Label>
              <select id="studentId" name="studentId" className="h-9 w-full rounded-md border bg-transparent px-3 text-sm" required defaultValue="">
                <option value="" disabled>Select a student</option>
                {studentOptions.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bedId">Bed</Label>
              <select id="bedId" name="bedId" className="h-9 w-full rounded-md border bg-transparent px-3 text-sm" required defaultValue="">
                <option value="" disabled>Select an available bed</option>
                {availableBeds.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
              </select>
              {availableBeds.length === 0 ? <p className="text-xs text-destructive">No available beds - add rooms or free up a bed first.</p> : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="academicYearId">Academic year</Label>
              <select id="academicYearId" name="academicYearId" className="h-9 w-full rounded-md border bg-transparent px-3 text-sm" required defaultValue="">
                <option value="" disabled>Select an academic year</option>
                {yearOptions.map((y) => <option key={y.value} value={y.value}>{y.label}</option>)}
              </select>
            </div>
            <div className="space-y-2"><Label htmlFor="checkInDate">Check-in date</Label><Input id="checkInDate" name="checkInDate" type="date" defaultValue={today} required /></div>
            <div className="space-y-2"><Label htmlFor="notes">Notes</Label><Textarea id="notes" name="notes" rows={2} /></div>
          </EntityDialog>
        ) : null}
      </div>

      {saved ? <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">Saved.</div> : null}
      {error && ERROR_MESSAGES[error] ? <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{ERROR_MESSAGES[error]}</div> : null}

      {allocations.length === 0 ? (
        <EmptyState icon={Users} title="No allocations yet" description="Allocate a student to a bed to get started." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Student</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Academic year</TableHead>
              <TableHead>Check-in</TableHead>
              <TableHead>Status</TableHead>
              {canManage ? <TableHead /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {allocations.map((allocation) => (
              <TableRow key={allocation.id}>
                <TableCell className="font-medium">{allocation.student.firstName} {allocation.student.lastName}</TableCell>
                <TableCell className="text-muted-foreground">{allocation.bed.room.building.name} · Room {allocation.bed.room.roomNumber} · Bed {allocation.bed.label}</TableCell>
                <TableCell className="text-muted-foreground">{allocation.academicYear.name}</TableCell>
                <TableCell className="text-muted-foreground">{allocation.checkInDate.toLocaleDateString()}</TableCell>
                <TableCell><Badge variant={allocation.status === "ACTIVE" ? "default" : "secondary"}>{allocation.status}</Badge></TableCell>
                {canManage ? (
                  <TableCell className="text-right">
                    {allocation.status === "ACTIVE" ? (
                      <EntityDialog trigger={<Button size="sm" variant="ghost">Check out</Button>} title={`Check out ${allocation.student.firstName} ${allocation.student.lastName}`} description="Frees the bed for a new allocation." action={endAllocationAction} submitLabel="Check out">
                        <input type="hidden" name="id" value={allocation.id} />
                        <div className="space-y-2"><Label htmlFor={`checkout-${allocation.id}`}>Check-out date</Label><Input id={`checkout-${allocation.id}`} name="checkOutDate" type="date" defaultValue={today} required /></div>
                      </EntityDialog>
                    ) : null}
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
