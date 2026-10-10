import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Lock, ShieldOff } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { StudentQuestionInputs, formatDateTime, trimZeros } from "@/components/school/assignments/assignment-ui";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { SchoolNotFoundError, SchoolStateError } from "@/modules/school/service";
import { getSchoolAssignmentPreview, isSchoolAssignmentsAvailable } from "@/modules/school/assignments-service";

/** Teacher preview of the current draft questions, rendered with the same inputs students get, minus submission. */
export default async function AssignmentPreviewPage({ params }: { params: Promise<{ assignmentId: string }> }) {
  const [tenant, { assignmentId }] = await Promise.all([requireModuleAccess("school"), params]);
  if (!hasPermission(tenant, PERMISSIONS.SCHOOL_EXAMS_MANAGE)) {
    return <div className="mx-auto max-w-screen-md space-y-6"><PageHeader title="Preview" /><EmptyState icon={Lock} title="Assignments are restricted" description="Your role needs the School exam management permission." /></div>;
  }
  if (!(await isSchoolAssignmentsAvailable(tenant.organizationId))) {
    return <div className="mx-auto max-w-screen-md space-y-6"><PageHeader title="Preview" /><EmptyState icon={ShieldOff} title="Assignments & Assessments isn't enabled" description="This is an optional School add-on. Contact Rock Frost to add it for your school." /></div>;
  }
  let preview: Awaited<ReturnType<typeof getSchoolAssignmentPreview>>;
  try {
    preview = await getSchoolAssignmentPreview(tenant.organizationId, tenant.userId, assignmentId);
  } catch (error) {
    if (error instanceof SchoolNotFoundError) notFound();
    if (error instanceof SchoolStateError) return <div className="mx-auto max-w-screen-md space-y-6"><PageHeader title="Preview" /><EmptyState icon={Lock} title="Not one of your classes" description={error.message} /></div>;
    throw error;
  }
  const timeZone = tenant.organization.timezone ?? "UTC";
  const { assignment, questions, maxScore } = preview;

  return (
    <div className="mx-auto max-w-screen-md space-y-6">
      <Link href={`/app/school/assignments/${assignment.id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground focus-visible:text-foreground"><ArrowLeft className="size-4" />Back to the assignment</Link>
      <Alert>
        <AlertTitle>Student preview</AlertTitle>
        <AlertDescription>This is your current working copy exactly as students will see it once published. Answers cannot be submitted from here and correct answers are not shown.</AlertDescription>
      </Alert>
      <PageHeader title={assignment.title} description={`${assignment.subject.name} · ${assignment.class.name} · due ${formatDateTime(assignment.dueAt, timeZone)} · ${trimZeros(maxScore)} points`} />
      {assignment.instructions ? <p className="whitespace-pre-wrap text-sm">{assignment.instructions}</p> : null}
      {questions.length === 0 ? <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">No questions yet.</p> : <StudentQuestionInputs questions={questions} />}
      <Button type="button" disabled>Submit answers (disabled in preview)</Button>
    </div>
  );
}
