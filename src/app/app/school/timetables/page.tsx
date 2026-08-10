import { CalendarClock, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FormFeedback, ReadOnlyNotice } from "@/components/school/form-feedback";
import { FieldGrid, SelectField, TextField } from "@/components/school/form-fields";
import { PrerequisiteNotice, SectionCard } from "@/components/school/section-card";
import { DAY_OPTIONS, formatDayOfWeek } from "@/components/school/format";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getSchoolAcademicSetup, listSchoolCampuses, listSchoolTimetable } from "@/modules/school/service";
import { createTimetableAction } from "../actions";

export default async function SchoolTimetablesPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const [tenant, query] = await Promise.all([requireModuleAccess("school"), searchParams]);
  const canManage = hasPermission(tenant, PERMISSIONS.SCHOOL_TIMETABLES_MANAGE);
  const [[years, classes, subjects], campuses, entries] = await Promise.all([
    getSchoolAcademicSetup(tenant.organizationId),
    listSchoolCampuses(tenant.organizationId),
    listSchoolTimetable(tenant.organizationId),
  ]);

  const termOptions = years.flatMap((year) => year.terms.map((term) => ({ value: term.id, label: `${year.name} · ${term.name}${term.current ? " (current)" : ""}` })));

  // listSchoolTimetable already orders by day then start time.
  const days = [1, 2, 3, 4, 5, 6, 7].map((day) => ({ day, entries: entries.filter((entry) => entry.dayOfWeek === day) })).filter((group) => group.entries.length > 0);

  const newPeriodDialog = (
    <EntityDialog
      trigger={<Button size="sm"><Plus />Add period</Button>}
      title="Add a timetable period"
      description="A period is rejected if it overlaps an existing period for the same class, teacher, or room in that term."
      action={createTimetableAction}
      submitLabel="Add period"
    >
      <SelectField id="timetable-campus" name="campusId" label="Campus" required options={campuses.map((campus) => ({ value: campus.id, label: campus.name }))} emptyHint="Create a campus first." />
      <SelectField id="timetable-term" name="termId" label="Term" required options={termOptions} emptyHint="Create a term first." />
      <FieldGrid>
        <SelectField id="timetable-class" name="classId" label="Class" required options={classes.map((schoolClass) => ({ value: schoolClass.id, label: `${schoolClass.campus.name} · ${schoolClass.name}` }))} emptyHint="Create a class first." />
        <SelectField id="timetable-subject" name="subjectId" label="Subject" required options={subjects.map((subject) => ({ value: subject.id, label: subject.name }))} emptyHint="Create a subject first." />
      </FieldGrid>
      <FieldGrid>
        <TextField id="timetable-teacher" name="teacherName" label="Teacher" required maxLength={200} hint="Matched by name when checking for clashes." />
        <TextField id="timetable-room" name="room" label="Room" maxLength={200} hint="Optional. Rooms are also checked for clashes." />
      </FieldGrid>
      <SelectField id="timetable-day" name="dayOfWeek" label="Day" required defaultValue="1" placeholder="Select a day…" options={DAY_OPTIONS} />
      <FieldGrid>
        <TextField id="timetable-start" name="startsAt" label="Starts at" type="time" required />
        <TextField id="timetable-end" name="endsAt" label="Ends at" type="time" required hint="Must be after the start time." />
      </FieldGrid>
    </EntityDialog>
  );

  const canAddPeriod = canManage && campuses.length > 0 && termOptions.length > 0 && classes.length > 0 && subjects.length > 0;

  return (
    <div className="mx-auto max-w-screen-2xl space-y-6">
      <PageHeader
        title="Timetables"
        description="Weekly class schedules. A class, teacher, or room can only be booked once in any time slot."
        actions={canAddPeriod ? newPeriodDialog : undefined}
      />

      <FormFeedback
        saved={query.saved}
        error={query.error}
        savedMessage="The timetable period has been added."
        stateMessage="This period clashes with an existing booking for the same class, teacher, or room — or the end time is not after the start time."
      />
      {!canManage ? <ReadOnlyNotice>Your role can review timetables but cannot change them.</ReadOnlyNotice> : null}
      <PrerequisiteNotice
        items={[
          { satisfied: campuses.length > 0, label: "Create a campus", href: "/app/school/campuses" },
          { satisfied: termOptions.length > 0, label: "Create a term", href: "/app/school/academic-periods" },
          { satisfied: classes.length > 0, label: "Create a class", href: "/app/school/classes" },
          { satisfied: subjects.length > 0, label: "Create a subject", href: "/app/school/classes" },
        ]}
      />

      {entries.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="No timetable periods yet"
          description="Add periods to build the weekly schedule. Clashing bookings are rejected automatically."
          action={canAddPeriod ? newPeriodDialog : undefined}
        />
      ) : (
        days.map(({ day, entries: dayEntries }) => (
          <SectionCard key={day} title={formatDayOfWeek(day)} description={`${dayEntries.length} period${dayEntries.length === 1 ? "" : "s"}`}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead className="hidden md:table-cell">Teacher</TableHead>
                  <TableHead className="hidden lg:table-cell">Room</TableHead>
                  <TableHead className="hidden lg:table-cell">Term</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dayEntries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="whitespace-nowrap font-medium tabular-nums">{entry.startsAt}–{entry.endsAt}</TableCell>
                    <TableCell>
                      {entry.class.name}
                      <span className="block text-xs text-muted-foreground">{entry.campus.name}</span>
                    </TableCell>
                    <TableCell>
                      {entry.subject.name}
                      <span className="block text-xs text-muted-foreground md:hidden">{entry.teacherName}</span>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">{entry.teacherName}</TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">{entry.room ?? "—"}</TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">{entry.term.name}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </SectionCard>
        ))
      )}
    </div>
  );
}
