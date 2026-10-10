import Link from "next/link";
import { Lock, NotebookPen, Plus, ShieldOff } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FormFeedback } from "@/components/school/form-feedback";
import { PrerequisiteNotice } from "@/components/school/section-card";
import { AssignmentSettingsFields, AssignmentStateBadge, formatDateTime } from "@/components/school/assignments/assignment-ui";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getSchoolAcademicSetup, resolveTeacherClassScope } from "@/modules/school/service";
import { isSchoolAssignmentsAvailable, listSchoolAssignmentsForStaff } from "@/modules/school/assignments-service";
import { teacherDisplayState } from "@/modules/school/assignment-grading";
import { createAssignmentAction } from "./actions";

const STATUS_FILTERS = [
  { value: "", label: "All states" },
  { value: "DRAFT", label: "Drafts" },
  { value: "PUBLISHED", label: "Published" },
  { value: "CLOSED", label: "Closed" },
  { value: "GRADED", label: "Graded" },
];

const SAVED_MESSAGES: Record<string, string> = {
  deleted: "The draft was deleted.",
};

export default async function SchoolAssignmentsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string; classId?: string; status?: string }> }) {
  const [tenant, query] = await Promise.all([requireModuleAccess("school"), searchParams]);
  const header = <PageHeader title="Assignments" description="Set work for a class, mark it, and choose whether it counts towards an exam." />;

  if (!hasPermission(tenant, PERMISSIONS.SCHOOL_EXAMS_MANAGE)) {
    return <div className="mx-auto max-w-screen-xl space-y-6">{header}<EmptyState icon={Lock} title="Assignments are restricted" description="Your role needs the School exam management permission to set and mark assignments." /></div>;
  }
  if (!(await isSchoolAssignmentsAvailable(tenant.organizationId))) {
    return <div className="mx-auto max-w-screen-xl space-y-6">{header}<EmptyState icon={ShieldOff} title="Assignments & Assessments isn't enabled" description="This is an optional School add-on. Contact Rock Frost to add it for your school." /></div>;
  }

  const timeZone = tenant.organization.timezone ?? "UTC";
  const status = STATUS_FILTERS.some((option) => option.value === query.status) ? query.status : "";
  const [[years, allClasses, subjects], scope, assignments] = await Promise.all([
    getSchoolAcademicSetup(tenant.organizationId),
    resolveTeacherClassScope(tenant.organizationId, tenant.userId),
    listSchoolAssignmentsForStaff(tenant.organizationId, tenant.userId, { classId: query.classId || undefined, status: status || undefined }),
  ]);
  // UX filter only; the service re-checks class scope on every read and write.
  const classes = scope ? allClasses.filter((schoolClass) => scope.has(schoolClass.id)) : allClasses;
  const classOptions = classes.filter((schoolClass) => schoolClass.active).map((schoolClass) => ({ value: schoolClass.id, label: `${schoolClass.campus.name} · ${schoolClass.name}` }));
  const subjectOptions = subjects.filter((subject) => subject.active).map((subject) => ({ value: subject.id, label: subject.name }));
  const termOptions = years.flatMap((year) => year.terms.map((term) => ({ value: term.id, label: `${year.name} · ${term.name}${term.current ? " (current)" : ""}` })));
  const currentTerm = years.flatMap((year) => year.terms).find((term) => term.current);
  const now = new Date();
  const ready = classOptions.length > 0 && subjectOptions.length > 0 && termOptions.length > 0;

  const createDialog = (
    <EntityDialog
      trigger={<Button size="sm"><Plus />New assignment</Button>}
      title="New assignment"
      description="It starts as a draft. Add questions, preview it, then publish when it is ready."
      action={createAssignmentAction}
      submitLabel="Create draft"
      contentClassName="sm:max-w-2xl max-h-[90vh] overflow-y-auto"
    >
      <AssignmentSettingsFields
        idPrefix="new-assignment"
        classOptions={classOptions}
        subjectOptions={subjectOptions}
        termOptions={termOptions}
        timeZone={timeZone}
        defaults={{ termId: currentTerm?.id, availableFrom: now, dueAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) }}
      />
    </EntityDialog>
  );

  return (
    <div className="mx-auto max-w-screen-xl space-y-6">
      <PageHeader
        title="Assignments"
        description="Set work for a class, mark it, and choose whether it counts towards an exam."
        actions={ready ? createDialog : null}
      />
      <FormFeedback saved={query.saved} error={query.error} savedMessage={SAVED_MESSAGES[query.saved ?? ""] ?? "Saved."} />
      <PrerequisiteNotice
        items={[
          { satisfied: termOptions.length > 0, label: "Create a term", href: "/app/school/academic-periods" },
          { satisfied: subjectOptions.length > 0 && classOptions.length > 0, label: "Create classes and subjects", href: "/app/school/classes" },
        ]}
      />
      {scope ? <p className="text-sm text-muted-foreground">Showing assignments for the {classes.length === 1 ? "class" : `${classes.length} classes`} you are assigned to.</p> : null}

      <form method="get" action="/app/school/assignments" className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-end">
        <div className="space-y-1.5 sm:w-64">
          <label htmlFor="filter-class" className="text-sm font-medium">Class</label>
          <select id="filter-class" name="classId" defaultValue={query.classId ?? ""} className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30">
            <option value="">All my classes</option>
            {classOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        <div className="space-y-1.5 sm:w-48">
          <label htmlFor="filter-status" className="text-sm font-medium">State</label>
          <select id="filter-status" name="status" defaultValue={status} className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30">
            {STATUS_FILTERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        <Button type="submit" variant="outline" size="sm">Filter</Button>
      </form>

      {assignments.length === 0 ? (
        <EmptyState
          icon={NotebookPen}
          title={query.classId || status ? "No assignments match these filters" : "No assignments yet"}
          description="Create a draft, add single choice, true or false, numeric, or written questions, preview it as a student, and publish it to the class."
          action={ready && !query.classId && !status ? createDialog : undefined}
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Assignment</TableHead>
                <TableHead className="hidden md:table-cell">Due</TableHead>
                <TableHead>State</TableHead>
                <TableHead className="hidden sm:table-cell">Submissions</TableHead>
                <TableHead className="hidden lg:table-cell">Cumulative record</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignments.map((assignment) => (
                <TableRow key={assignment.id}>
                  <TableCell>
                    <Link href={`/app/school/assignments/${assignment.id}`} className="font-medium underline-offset-4 hover:underline focus-visible:underline">{assignment.title}</Link>
                    <span className="block text-xs text-muted-foreground">{assignment.class.name} · {assignment.subject.name} · {assignment.term.name}</span>
                    <span className="block text-xs text-muted-foreground md:hidden">Due {formatDateTime(assignment.dueAt, timeZone)}</span>
                  </TableCell>
                  <TableCell className="hidden text-sm md:table-cell">{formatDateTime(assignment.dueAt, timeZone)}</TableCell>
                  <TableCell><AssignmentStateBadge state={teacherDisplayState({ status: assignment.status, availableFrom: assignment.availableFrom, dueAt: assignment.dueAt, now })} /></TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <span className="tabular-nums">{assignment._count.submissions}</span>
                    {assignment.submissions.length > 0 ? <Badge variant="secondary" className="ml-2">{assignment.submissions.length} to mark</Badge> : null}
                  </TableCell>
                  <TableCell className="hidden text-sm lg:table-cell">
                    {assignment.includeInGradebook && assignment.gradebookExam ? <Badge>Counts in {assignment.gradebookExam.name}</Badge> : <span className="text-muted-foreground">Not included</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
