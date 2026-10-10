import Link from "next/link";
import { Lock, NotebookPen, ShieldOff } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Badge } from "@/components/ui/badge";
import { SectionCard } from "@/components/school/section-card";
import { formatDateTime, formatScore } from "@/components/school/assignments/assignment-ui";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { isSchoolPortalGranted } from "@/lib/platform-communications";
import { SchoolStateError } from "@/modules/school/service";
import { isSchoolAssignmentsAvailable, listSchoolAssignmentsForStudent } from "@/modules/school/assignments-service";

type StudentAssignment = Awaited<ReturnType<typeof listSchoolAssignmentsForStudent>>["assignments"][number];

function statusLine(assignment: StudentAssignment) {
  if (assignment.mark.state === "final") return { label: "Marked", variant: "default" as const };
  if (assignment.mark.state === "pending") return { label: "Waiting for marking", variant: "secondary" as const };
  if (assignment.mark.state === "submitted") return { label: "Submitted", variant: "secondary" as const };
  if (assignment.availability === "scheduled") return { label: "Not open yet", variant: "outline" as const };
  if (assignment.availability === "open") return { label: "To do", variant: "default" as const };
  if (assignment.availability === "late") return { label: "Overdue, late work accepted", variant: "destructive" as const };
  return { label: "Missed", variant: "outline" as const };
}

export default async function StudentAssignmentsPage() {
  const tenant = await requireModuleAccess("school");
  const header = <PageHeader title="My Assignments" description="Work set for your class, what is due, and your marks once your teacher releases them." />;
  if (!hasPermission(tenant, PERMISSIONS.SCHOOL_PORTAL_VIEW)) {
    return <div className="mx-auto max-w-screen-lg space-y-6">{header}<EmptyState icon={Lock} title="Portal access is restricted" description="Your role does not include School portal access." /></div>;
  }
  if (!(await isSchoolPortalGranted(tenant.organizationId)) || !(await isSchoolAssignmentsAvailable(tenant.organizationId))) {
    return <div className="mx-auto max-w-screen-lg space-y-6">{header}<EmptyState icon={ShieldOff} title="Not available right now" description="Online assignments are not currently enabled for your school. Contact the school office for more information." /></div>;
  }
  let data: Awaited<ReturnType<typeof listSchoolAssignmentsForStudent>>;
  try {
    data = await listSchoolAssignmentsForStudent(tenant.organizationId, tenant.userId);
  } catch (error) {
    if (error instanceof SchoolStateError) return <div className="mx-auto max-w-screen-lg space-y-6">{header}<EmptyState icon={Lock} title="Assignments are for student accounts" description={error.message} /></div>;
    throw error;
  }
  const timeZone = tenant.organization.timezone ?? "UTC";
  const toDo = data.assignments.filter((assignment) => assignment.attemptsUsed === 0 && (assignment.availability === "open" || assignment.availability === "late"));
  const upcoming = data.assignments.filter((assignment) => assignment.availability === "scheduled");
  const done = data.assignments.filter((assignment) => !toDo.includes(assignment) && !upcoming.includes(assignment));

  const list = (items: StudentAssignment[], empty: string) => items.length === 0 ? <p className="text-sm text-muted-foreground">{empty}</p> : (
    <ul className="divide-y rounded-lg border">
      {items.map((assignment) => {
        const status = statusLine(assignment);
        return (
          <li key={assignment.id}>
            <Link href={`/app/school/portal/assignments/${assignment.id}`} className="flex flex-col gap-2 p-4 hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none sm:flex-row sm:items-center sm:justify-between">
              <span className="min-w-0">
                <span className="block font-medium">{assignment.title}</span>
                <span className="block text-xs text-muted-foreground">{assignment.subject.name} · {assignment.availability === "scheduled" ? `opens ${formatDateTime(assignment.availableFrom, timeZone)}` : `due ${formatDateTime(assignment.dueAt, timeZone)}`}</span>
                <span className="block text-xs text-muted-foreground">{assignment.attemptsRemaining} of {assignment.maxAttempts} attempt{assignment.maxAttempts === 1 ? "" : "s"} left</span>
              </span>
              <span className="flex shrink-0 flex-wrap items-center gap-2">
                {assignment.mark.state === "final" ? <span className="text-sm font-medium tabular-nums">{formatScore(assignment.mark.score, assignment.mark.maxScore)}</span> : null}
                <Badge variant={status.variant}>{status.label}</Badge>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="mx-auto max-w-screen-lg space-y-6">
      {header}
      {data.assignments.length === 0 ? (
        <EmptyState icon={NotebookPen} title="No assignments yet" description="When a teacher sets work for your class it appears here." />
      ) : (
        <>
          <SectionCard title={`To do (${toDo.length})`}>{list(toDo, "Nothing to do right now.")}</SectionCard>
          {upcoming.length > 0 ? <SectionCard title={`Coming up (${upcoming.length})`}>{list(upcoming, "")}</SectionCard> : null}
          <SectionCard title={`Submitted and past (${done.length})`}>{list(done, "Nothing here yet.")}</SectionCard>
        </>
      )}
    </div>
  );
}
