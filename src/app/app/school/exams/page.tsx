import { GraduationCap } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getSchoolAcademicSetup, listSchoolExams, listSchoolStudents } from "@/modules/school/service";
import { createExamAction, publishExamAction, recordExamResultAction, submitExamForModerationAction } from "../actions";

const Select = ({ name, items }: { name: string; items: [string, string][] }) => <select name={name} required className="h-9 rounded-md border bg-transparent px-3 text-sm"><option value="">Select...</option>{items.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>;

export default async function ExamsPage() {
  const tenant = await requireModuleAccess("school");
  const manage = hasPermission(tenant, PERMISSIONS.SCHOOL_EXAMS_MANAGE);
  const publish = hasPermission(tenant, PERMISSIONS.SCHOOL_EXAMS_PUBLISH);
  const [[years, classes, subjects], students, exams] = await Promise.all([getSchoolAcademicSetup(tenant.organizationId), listSchoolStudents(tenant.organizationId), listSchoolExams(tenant.organizationId)]);
  const terms = years.flatMap((year) => year.terms.map((term) => [term.id, `${year.name} / ${term.name}`] as [string, string]));
  return <div className="space-y-6">
    <PageHeader title="Exams & Grading" description="Assessments, marks validation, moderation, publishing, and report-card inputs." />
    {manage ? <div className="grid gap-4 lg:grid-cols-2">
      <form action={createExamAction} className="grid gap-2 rounded-lg border p-4"><Select name="academicYearId" items={years.map((year) => [year.id, year.name])} /><Select name="termId" items={terms} /><Select name="subjectId" items={subjects.map((subject) => [subject.id, subject.name])} /><Input name="name" placeholder="Exam name" required /><div className="flex gap-2"><Input name="totalMarks" type="number" defaultValue="100" /><Input name="weight" type="number" defaultValue="100" /><Input name="examDate" type="date" /></div><Button size="sm">Create exam</Button></form>
      <form action={recordExamResultAction} className="grid gap-2 rounded-lg border p-4"><Select name="examId" items={exams.filter((exam) => exam.status === "OPEN").map((exam) => [exam.id, `${exam.name} / ${exam.subject.name}`])} /><Select name="studentId" items={students.map((student) => [student.id, `${student.firstName} ${student.lastName}`])} /><Select name="classId" items={classes.map((schoolClass) => [schoolClass.id, schoolClass.name])} /><Select name="subjectId" items={subjects.map((subject) => [subject.id, subject.name])} /><Input name="marks" type="number" step="0.01" min="0" placeholder="Marks" /><Input name="grade" placeholder="Grade" /><Input name="remark" placeholder="Remark" /><Button size="sm">Save result</Button></form>
    </div> : null}
    {exams.length === 0 ? <EmptyState icon={GraduationCap} title="No exams" description="Create an exam and enter moderated results." /> : <div className="space-y-2">{exams.map((exam) => <div key={exam.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"><span>{exam.name} / {exam.subject.name} / {exam.results.length} results</span><div className="flex items-center gap-2 text-sm text-muted-foreground"><span>{exam.status}</span>{manage && exam.status === "OPEN" && exam.results.length > 0 ? <form action={submitExamForModerationAction}><input type="hidden" name="examId" value={exam.id} /><Button size="sm" variant="outline">Submit for moderation</Button></form> : null}{publish && exam.status === "MODERATION" ? <form action={publishExamAction}><input type="hidden" name="examId" value={exam.id} /><Button size="sm">Publish</Button></form> : null}</div></div>)}</div>}
  </div>;
}
