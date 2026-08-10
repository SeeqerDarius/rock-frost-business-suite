import { CalendarRange, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FormFeedback, ReadOnlyNotice } from "@/components/school/form-feedback";
import { CheckboxField, FieldGrid, SelectField, TextField } from "@/components/school/form-fields";
import { SectionCard } from "@/components/school/section-card";
import { formatDate } from "@/components/school/format";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getSchoolAcademicSetup } from "@/modules/school/service";
import { createAcademicYearAction, createTermAction } from "../actions";

export default async function SchoolAcademicPeriodsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const [tenant, query] = await Promise.all([requireModuleAccess("school"), searchParams]);
  const canManage = hasPermission(tenant, PERMISSIONS.SCHOOL_ACADEMICS_MANAGE);
  const [years] = await getSchoolAcademicSetup(tenant.organizationId);
  const currentYear = years.find((year) => year.current);

  const newYearDialog = (
    <EntityDialog
      trigger={<Button size="sm"><Plus />New academic year</Button>}
      title="New academic year"
      description="Terms, enrollment, fees, and exams are all recorded against an academic year."
      action={createAcademicYearAction}
      submitLabel="Create academic year"
    >
      <TextField id="year-name" name="name" label="Name" placeholder="2026/2027" required maxLength={200} />
      <FieldGrid>
        <TextField id="year-start" name="startDate" label="Start date" type="date" required />
        <TextField id="year-end" name="endDate" label="End date" type="date" required hint="Must be after the start date." />
      </FieldGrid>
      <CheckboxField id="year-current" name="current" label="Make this the current academic year" hint="Any other year currently marked as current will be cleared." />
    </EntityDialog>
  );

  const newTermDialog = (
    <EntityDialog
      trigger={<Button size="sm" variant="outline"><Plus />New term</Button>}
      title="New term"
      description="Terms divide an academic year. Attendance, fees, timetables, and exams are recorded per term."
      action={createTermAction}
      submitLabel="Create term"
    >
      <SelectField
        id="term-year"
        name="academicYearId"
        label="Academic year"
        required
        options={years.map((year) => ({ value: year.id, label: year.name }))}
        emptyHint="Create an academic year first."
      />
      <TextField id="term-name" name="name" label="Term name" placeholder="Term 1" required maxLength={200} />
      <FieldGrid>
        <TextField id="term-start" name="startDate" label="Start date" type="date" required />
        <TextField id="term-end" name="endDate" label="End date" type="date" required />
      </FieldGrid>
      <p className="text-xs leading-relaxed text-muted-foreground">Term dates must fall inside the selected academic year.</p>
      <CheckboxField id="term-current" name="current" label="Make this the current term" hint="Any other term currently marked as current will be cleared." />
    </EntityDialog>
  );

  return (
    <div className="mx-auto max-w-screen-2xl space-y-6">
      <PageHeader
        title="Academic Periods"
        description="Academic years and their terms. Exactly one year and one term are marked current at a time."
        actions={canManage ? <>{newYearDialog}{years.length > 0 ? newTermDialog : null}</> : undefined}
      />

      <FormFeedback
        saved={query.saved}
        error={query.error}
        savedMessage="The academic period is saved and available to attendance, fees, timetables, and exams."
        stateMessage="Check the dates: an academic year must end after it starts, and a term must fall entirely inside its academic year."
      />
      {!canManage ? <ReadOnlyNotice>Your role can review academic periods but cannot create or change them.</ReadOnlyNotice> : null}

      {currentYear ? (
        <p className="text-sm text-muted-foreground">
          Current academic year: <span className="font-medium text-foreground">{currentYear.name}</span>
          {currentYear.terms.some((term) => term.current) ? <> · Current term: <span className="font-medium text-foreground">{currentYear.terms.find((term) => term.current)?.name}</span></> : " · No current term set"}
        </p>
      ) : years.length > 0 ? (
        <p className="text-sm text-muted-foreground">No academic year is marked as current.</p>
      ) : null}

      {years.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title="No academic years yet"
          description="Create the current academic year and its terms before recording attendance, fees, timetables, or exams."
          action={canManage ? newYearDialog : undefined}
        />
      ) : (
        years.map((year) => (
          <SectionCard
            key={year.id}
            title={year.name}
            description={`${formatDate(year.startDate)} – ${formatDate(year.endDate)}`}
            actions={year.current ? <Badge>Current year</Badge> : <Badge variant="outline">Not current</Badge>}
          >
            {year.terms.length === 0 ? (
              <p className="text-sm text-muted-foreground">No terms yet. Attendance, fees, and exams need a term before they can be recorded.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Term</TableHead>
                    <TableHead>Starts</TableHead>
                    <TableHead>Ends</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...year.terms].sort((a, b) => a.startDate.getTime() - b.startDate.getTime()).map((term) => (
                    <TableRow key={term.id}>
                      <TableCell className="font-medium">{term.name}</TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(term.startDate)}</TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(term.endDate)}</TableCell>
                      <TableCell>{term.current ? <Badge>Current</Badge> : <Badge variant="outline">—</Badge>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </SectionCard>
        ))
      )}
    </div>
  );
}
