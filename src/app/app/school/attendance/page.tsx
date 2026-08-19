import { ClipboardCheck } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FormFeedback, ReadOnlyNotice } from "@/components/school/form-feedback";
import { PrerequisiteNotice, SectionCard } from "@/components/school/section-card";
import { RecordSearch } from "@/components/school/record-search";
import { StatusBadge } from "@/components/school/status-badge";
import { formatDate, humanizeStatus } from "@/components/school/format";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getSchoolAcademicSetup, getSchoolAttendanceRoster, listSchoolAttendance } from "@/modules/school/service";
import { recordAttendanceBulkAction } from "../actions";

const PATH = "/app/school/attendance";
const STATUSES = ["PRESENT", "ABSENT", "LATE", "EXCUSED"] as const;

/** Matches SelectField's native-select styling (form-fields.tsx) without its label/hint wrapper — too dense for one select per roster row. */
const SELECT_CLASS = "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80";

export default async function SchoolAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string; count?: string; skipped?: string; q?: string; status?: string; termId?: string; classId?: string; date?: string }>;
}) {
  const [tenant, query] = await Promise.all([requireModuleAccess("school"), searchParams]);
  const canManage = hasPermission(tenant, PERMISSIONS.SCHOOL_ATTENDANCE_MANAGE);
  const [[years, classes], records] = await Promise.all([
    getSchoolAcademicSetup(tenant.organizationId),
    listSchoolAttendance(tenant.organizationId),
  ]);

  const termOptions = years.flatMap((year) => year.terms.map((term) => ({ value: term.id, label: `${year.name} · ${term.name}${term.current ? " (current)" : ""}`, current: term.current })));
  const today = new Date().toISOString().slice(0, 10);
  const currentTermId = termOptions.find((term) => term.current)?.value;

  const selectedTermId = query.termId && termOptions.some((term) => term.value === query.termId) ? query.termId : undefined;
  const selectedClass = query.classId ? classes.find((schoolClass) => schoolClass.id === query.classId) : undefined;
  const selectedDate = query.date && /^\d{4}-\d{2}-\d{2}$/.test(query.date) ? query.date : undefined;

  let roster: Awaited<ReturnType<typeof getSchoolAttendanceRoster>> | null = null;
  let rosterError: string | null = null;
  if (canManage && selectedTermId && selectedClass && selectedDate) {
    try {
      roster = await getSchoolAttendanceRoster(tenant.organizationId, tenant.userId, { termId: selectedTermId, classId: selectedClass.id, date: new Date(`${selectedDate}T00:00:00`) });
    } catch (error) {
      rosterError = error instanceof Error ? error.message : "Couldn't load this class's roster.";
    }
  }

  // Mirrors recordSchoolAttendanceBulk's own window check, purely so the form doesn't invite a submit that the server will reject anyway.
  const isFuture = selectedDate ? selectedDate > today : false;
  let windowClosed = false;
  if (roster && selectedDate) {
    const oldestAllowed = new Date();
    oldestAllowed.setHours(0, 0, 0, 0);
    oldestAllowed.setDate(oldestAllowed.getDate() - roster.closeDays);
    windowClosed = new Date(`${selectedDate}T00:00:00`) < oldestAllowed;
  }

  const savedMessage = query.count
    ? `Attendance saved for ${query.count} student${query.count === "1" ? "" : "s"}.${query.skipped ? ` ${query.skipped} skipped — no longer actively enrolled in this class.` : ""}`
    : "Attendance has been recorded.";

  // listSchoolAttendance returns the 250 most recent records; search and the
  // status filter apply to that window only.
  const search = query.q?.trim().toLowerCase() ?? "";
  const statusFilter = STATUSES.find((status) => status === query.status);
  const visible = records.filter((record) => {
    const matchesSearch = search === "" || `${record.student.firstName} ${record.student.lastName} ${record.student.admissionNumber} ${record.class.name}`.toLowerCase().includes(search);
    return matchesSearch && (!statusFilter || record.status === statusFilter);
  });

  const rosterFilterForm = (
    <form method="GET" className="flex flex-wrap items-end gap-3">
      <div className="w-56 space-y-1.5">
        <Label htmlFor="roster-term">Term</Label>
        <select id="roster-term" name="termId" defaultValue={selectedTermId ?? currentTermId ?? ""} disabled={termOptions.length === 0} className={SELECT_CLASS}>
          <option value="">Select a term…</option>
          {termOptions.map((term) => <option key={term.value} value={term.value}>{term.label}</option>)}
        </select>
      </div>
      <div className="w-56 space-y-1.5">
        <Label htmlFor="roster-class">Class</Label>
        <select id="roster-class" name="classId" defaultValue={selectedClass?.id ?? ""} disabled={classes.length === 0} className={SELECT_CLASS}>
          <option value="">Select a class…</option>
          {classes.map((schoolClass) => <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.campus.name} · {schoolClass.name}</option>)}
        </select>
      </div>
      <div className="w-40 space-y-1.5">
        <Label htmlFor="roster-date">Date</Label>
        <input id="roster-date" type="date" name="date" defaultValue={selectedDate ?? today} max={today} className={SELECT_CLASS} />
      </div>
      <Button type="submit" size="sm">Load roster</Button>
    </form>
  );

  return (
    <div className="mx-auto max-w-screen-2xl space-y-6">
      <PageHeader
        title="Attendance"
        description="Take attendance for a whole class at once, or review and search past records."
      />

      <FormFeedback saved={query.saved} error={query.error} savedMessage={savedMessage} stateMessage="Attendance can't be saved for a future date, or the correction window for that date has already closed." />
      {!canManage ? <ReadOnlyNotice>Your role can review attendance but cannot record or correct it.</ReadOnlyNotice> : null}
      <PrerequisiteNotice
        items={[
          { satisfied: classes.length > 0, label: "Create a class", href: "/app/school/classes" },
          { satisfied: termOptions.length > 0, label: "Create a term", href: "/app/school/academic-periods" },
        ]}
      />

      {canManage && termOptions.length > 0 && classes.length > 0 ? (
        <SectionCard title="Take attendance" description="Pick a class and date to mark every actively enrolled student in one pass — everyone defaults to Present, so you only touch the exceptions.">
          <div className="space-y-4">
            {rosterFilterForm}

            {rosterError ? (
              <ReadOnlyNotice>{rosterError}</ReadOnlyNotice>
            ) : roster && selectedClass && selectedDate ? (
              roster.entries.length === 0 ? (
                <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">No active students are enrolled in {selectedClass.name} yet.</p>
              ) : isFuture || windowClosed ? (
                <ReadOnlyNotice>{isFuture ? "Attendance cannot be recorded for a future date." : "The attendance correction window for this date has already closed."}</ReadOnlyNotice>
              ) : (
                <form action={recordAttendanceBulkAction} className="space-y-4">
                  <input type="hidden" name="termId" value={selectedTermId} />
                  <input type="hidden" name="classId" value={selectedClass.id} />
                  <input type="hidden" name="date" value={selectedDate} />
                  <div className="overflow-x-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Student</TableHead>
                          <TableHead className="w-40">Status</TableHead>
                          <TableHead>Reason</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {roster.entries.map((entry) => (
                          <TableRow key={entry.studentId}>
                            <TableCell>
                              <span className="font-medium">{entry.lastName}, {entry.firstName}</span>
                              <span className="block font-mono text-xs text-muted-foreground">{entry.admissionNumber}</span>
                            </TableCell>
                            <TableCell>
                              <label htmlFor={`status-${entry.studentId}`} className="sr-only">Status for {entry.firstName} {entry.lastName}</label>
                              <select id={`status-${entry.studentId}`} name={`status_${entry.studentId}`} defaultValue={entry.status ?? "PRESENT"} className={SELECT_CLASS}>
                                {STATUSES.map((status) => <option key={status} value={status}>{humanizeStatus(status)}</option>)}
                              </select>
                            </TableCell>
                            <TableCell>
                              <label htmlFor={`reason-${entry.studentId}`} className="sr-only">Reason for {entry.firstName} {entry.lastName}</label>
                              <Input id={`reason-${entry.studentId}`} name={`reason_${entry.studentId}`} defaultValue={entry.reason ?? ""} maxLength={200} placeholder="Optional" />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <Button type="submit">Save attendance ({roster.entries.length} student{roster.entries.length === 1 ? "" : "s"})</Button>
                </form>
              )
            ) : (
              <p className="text-sm text-muted-foreground">Choose a term, class, and date, then load the roster to mark attendance.</p>
            )}
          </div>
        </SectionCard>
      ) : null}

      {records.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="No attendance records yet"
          description="Take attendance for a class above to get started."
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
