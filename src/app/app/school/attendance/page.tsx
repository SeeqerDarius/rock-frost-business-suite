import { ClipboardCheck, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FormFeedback, ReadOnlyNotice } from "@/components/school/form-feedback";
import { SelectField, TextField } from "@/components/school/form-fields";
import { PrerequisiteNotice, SectionCard } from "@/components/school/section-card";
import { RecordSearch } from "@/components/school/record-search";
import { StatusBadge } from "@/components/school/status-badge";
import { formatDate, humanizeStatus } from "@/components/school/format";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getSchoolAcademicSetup, listSchoolAttendance, listSchoolStudents } from "@/modules/school/service";
import { recordAttendanceAction } from "../actions";

const PATH = "/app/school/attendance";
const STATUSES = ["PRESENT", "ABSENT", "LATE", "EXCUSED"] as const;

export default async function SchoolAttendancePage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string; q?: string; status?: string }> }) {
  const [tenant, query] = await Promise.all([requireModuleAccess("school"), searchParams]);
  const canManage = hasPermission(tenant, PERMISSIONS.SCHOOL_ATTENDANCE_MANAGE);
  const [[years, classes], students, records] = await Promise.all([
    getSchoolAcademicSetup(tenant.organizationId),
    listSchoolStudents(tenant.organizationId),
    listSchoolAttendance(tenant.organizationId),
  ]);

  const termOptions = years.flatMap((year) => year.terms.map((term) => ({ value: term.id, label: `${year.name} · ${term.name}${term.current ? " (current)" : ""}` })));
  const today = new Date().toISOString().slice(0, 10);

  // listSchoolAttendance returns the 250 most recent records; search and the
  // status filter apply to that window only.
  const search = query.q?.trim().toLowerCase() ?? "";
  const statusFilter = STATUSES.find((status) => status === query.status);
  const visible = records.filter((record) => {
    const matchesSearch = search === "" || `${record.student.firstName} ${record.student.lastName} ${record.student.admissionNumber} ${record.class.name}`.toLowerCase().includes(search);
    return matchesSearch && (!statusFilter || record.status === statusFilter);
  });

  const recordDialog = (
    <EntityDialog
      trigger={<Button size="sm"><Plus />Record attendance</Button>}
      title="Record attendance"
      description="Recording the same student and date again updates the existing record."
      action={recordAttendanceAction}
      submitLabel="Save attendance"
    >
      <SelectField id="attendance-term" name="termId" label="Term" required options={termOptions} emptyHint="Create an academic year and term first." />
      <SelectField id="attendance-class" name="classId" label="Class" required options={classes.map((schoolClass) => ({ value: schoolClass.id, label: `${schoolClass.campus.name} · ${schoolClass.name}` }))} emptyHint="Create a class first." />
      <SelectField
        id="attendance-student"
        name="studentId"
        label="Student"
        required
        options={students.filter((student) => student.status === "ACTIVE").map((student) => ({ value: student.id, label: `${student.lastName}, ${student.firstName} (${student.admissionNumber})` }))}
        emptyHint="Only active students can be marked."
        hint="The student must be actively enrolled in the class you selected."
      />
      <TextField id="attendance-date" name="date" label="Date" type="date" defaultValue={today} max={today} required hint="Future dates are rejected, and each campus closes corrections after a set number of days." />
      <SelectField id="attendance-status" name="status" label="Attendance status" required defaultValue="PRESENT" placeholder="Select a status…" options={STATUSES.map((status) => ({ value: status, label: humanizeStatus(status) }))} />
      <TextField id="attendance-reason" name="reason" label="Reason" maxLength={200} hint="Optional. Recommended for absent, late, and excused records." />
    </EntityDialog>
  );

  return (
    <div className="mx-auto max-w-screen-2xl space-y-6">
      <PageHeader
        title="Attendance"
        description="Daily student attendance with enrollment validation and auditable corrections."
        actions={canManage && termOptions.length > 0 && classes.length > 0 ? recordDialog : undefined}
      />

      <FormFeedback
        saved={query.saved}
        error={query.error}
        savedMessage="Attendance has been recorded."
        stateMessage="Attendance can't be saved for a future date, or the correction window for that date has already closed."
      />
      {!canManage ? <ReadOnlyNotice>Your role can review attendance but cannot record or correct it.</ReadOnlyNotice> : null}
      <PrerequisiteNotice
        items={[
          { satisfied: classes.length > 0, label: "Create a class", href: "/app/school/classes" },
          { satisfied: termOptions.length > 0, label: "Create a term", href: "/app/school/academic-periods" },
        ]}
      />

      {records.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="No attendance records yet"
          description="Attendance can only be recorded for a student who is actively enrolled in the class you select."
          action={canManage && termOptions.length > 0 && classes.length > 0 ? recordDialog : undefined}
        />
      ) : (
        <SectionCard title="Recent attendance" description="The 250 most recent records, newest first.">
          <div className="space-y-4">
            <RecordSearch
              action={PATH}
              label="Search attendance"
              placeholder="Student name, admission number, or class"
              defaultValue={query.q}
              isFiltered={Boolean(query.q || statusFilter)}
              resultSummary={`Showing ${visible.length} of ${records.length}`}
              filters={
                <div className="w-40 space-y-1.5">
                  <Label htmlFor="attendance-status-filter">Status</Label>
                  <select
                    id="attendance-status-filter"
                    name="status"
                    defaultValue={statusFilter ?? ""}
                    className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
                  >
                    <option value="">All statuses</option>
                    {STATUSES.map((status) => <option key={status} value={status}>{humanizeStatus(status)}</option>)}
                  </select>
                </div>
              }
            />

            {visible.length === 0 ? (
              <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">No attendance records match this search.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead className="hidden md:table-cell">Class</TableHead>
                    <TableHead className="hidden lg:table-cell">Term</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden lg:table-cell">Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(record.date)}</TableCell>
                      <TableCell>
                        <span className="font-medium">{record.student.firstName} {record.student.lastName}</span>
                        <span className="block font-mono text-xs text-muted-foreground">{record.student.admissionNumber}</span>
                        <span className="block text-xs text-muted-foreground md:hidden">{record.class.name}</span>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">{record.class.name}</TableCell>
                      <TableCell className="hidden text-muted-foreground lg:table-cell">{record.term.name}</TableCell>
                      <TableCell><StatusBadge status={record.status} /></TableCell>
                      <TableCell className="hidden text-muted-foreground lg:table-cell">{record.reason ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </SectionCard>
      )}
    </div>
  );
}
