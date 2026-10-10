import { ClipboardList, Lock } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { SectionCard } from "@/components/school/section-card";
import { PrintButton } from "@/components/school/print-button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getSchoolAcademicSetup } from "@/modules/school/service";
import { getSchoolBroadsheet } from "@/modules/school/broadsheet-service";
import { schoolPlanGate } from "@/components/school/plan-gate";

const INPUT_CLASS = "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export default async function SchoolBroadsheetPage({ searchParams }: { searchParams: Promise<{ classId?: string; termId?: string }> }) {
  const [tenant, query] = await Promise.all([requireModuleAccess("school"), searchParams]);
  // Plan gate. Navigation already hides this page when the plan does
  // not include it, but a hidden link is not a boundary.
  const gate = await schoolPlanGate(tenant.organizationId, "school.exams", "Exam broadsheet", "A class's subjects across the top, every student ranked by average performance down the side.");
  if (gate) return gate;
  const canView = hasPermission(tenant, PERMISSIONS.SCHOOL_EXAMS_MANAGE) || hasPermission(tenant, PERMISSIONS.SCHOOL_EXAMS_PUBLISH) || hasPermission(tenant, PERMISSIONS.SCHOOL_ACADEMIC_PERFORMANCE_VIEW) || hasPermission(tenant, PERMISSIONS.SCHOOL_REPORTS_VIEW);

  if (!canView) {
    return (
      <div className="mx-auto max-w-screen-2xl space-y-6">
        <PageHeader title="Exam broadsheet" description="A class's subjects across the top, every student ranked by average performance down the side." />
        <EmptyState icon={Lock} title="Broadsheet is restricted" description="Your role does not include School academic performance or exams access." />
      </div>
    );
  }

  const [years, classes] = await getSchoolAcademicSetup(tenant.organizationId);
  const termOptions = years.flatMap((year) => year.terms.map((term) => ({ value: term.id, label: `${year.name} · ${term.name}${term.current ? " (current)" : ""}` })));
  const classId = classes.some((schoolClass) => schoolClass.id === query.classId) ? query.classId : undefined;
  const termId = termOptions.some((term) => term.value === query.termId) ? query.termId : undefined;

  const broadsheet = classId && termId ? await getSchoolBroadsheet(tenant.organizationId, classId, termId) : null;

  return (
    <div className="mx-auto max-w-screen-2xl space-y-6 print:space-y-3">
      <PageHeader title="Exam broadsheet" description="Pick a class and term to see every subject as a column and every student ranked by average across all published exam results." />

      <form method="GET" className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/30 p-4 print:hidden" aria-label="Broadsheet filters">
        <div className="min-w-56 flex-1 space-y-1.5">
          <Label htmlFor="broadsheet-class">Class</Label>
          <select id="broadsheet-class" name="classId" defaultValue={classId ?? ""} className={INPUT_CLASS}>
            <option value="">Select a class</option>
            {classes.map((schoolClass) => <option key={schoolClass.id} value={schoolClass.id}>{schoolClass.campus.name} · {schoolClass.name}</option>)}
          </select>
        </div>
        <div className="min-w-56 flex-1 space-y-1.5">
          <Label htmlFor="broadsheet-term">Term</Label>
          <select id="broadsheet-term" name="termId" defaultValue={termId ?? ""} className={INPUT_CLASS}>
            <option value="">Select a term</option>
            {termOptions.map((term) => <option key={term.value} value={term.value}>{term.label}</option>)}
          </select>
        </div>
        <button type="submit" className="inline-flex h-8 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">View broadsheet</button>
      </form>

      {!classId || !termId ? (
        <EmptyState icon={ClipboardList} title="Choose a class and term" description="The broadsheet is built from every published exam result recorded for that class in that term." />
      ) : !broadsheet || broadsheet.subjects.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No published results yet" description="Only PUBLISHED exams count toward the broadsheet. Publish at least one exam's results for this class and term first." />
      ) : (
        <SectionCard
          title={`${broadsheet.className}, ${broadsheet.academicYearName} · ${broadsheet.termName}`}
          description={broadsheet.allowRanking ? "Ranked by average percentage across every subject examined. Enable \"Allow ranking\" in School Settings to hide positions." : "Ranking is off for this campus (School Settings > Allow ranking). Rows are sorted alphabetically."}
          actions={<PrintButton />}
        >
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {broadsheet.allowRanking ? <TableHead className="whitespace-nowrap">Pos.</TableHead> : null}
                  <TableHead className="whitespace-nowrap">Student</TableHead>
                  {broadsheet.subjects.map((subject) => <TableHead key={subject.id} className="whitespace-nowrap text-center">{subject.name}</TableHead>)}
                  <TableHead className="whitespace-nowrap text-center">Total</TableHead>
                  <TableHead className="whitespace-nowrap text-center">Average</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {broadsheet.rows.map((row) => (
                  <TableRow key={row.studentId}>
                    {broadsheet.allowRanking ? (
                      <TableCell className="font-semibold tabular-nums">{row.position ?? "-"}</TableCell>
                    ) : null}
                    <TableCell>
                      <span className="font-medium">{row.firstName} {row.lastName}</span>
                      <span className="block font-mono text-xs text-muted-foreground">{row.admissionNumber}</span>
                    </TableCell>
                    {row.cells.map((cell) => (
                      <TableCell key={cell.subjectId} className="text-center tabular-nums">
                        {cell.percent === null ? (
                          <span className="text-muted-foreground">-</span>
                        ) : (
                          <div className="flex flex-col items-center">
                            <span>{cell.grade ?? `${Math.round(cell.percent)}%`}</span>
                            {cell.remark ? <span className="text-[11px] text-muted-foreground">{cell.remark}</span> : null}
                          </div>
                        )}
                      </TableCell>
                    ))}
                    <TableCell className="text-center font-medium tabular-nums">{row.total.toFixed(1)}</TableCell>
                    <TableCell className="text-center tabular-nums">
                      {row.average === null ? <span className="text-muted-foreground">-</span> : <Badge variant="outline">{row.average.toFixed(1)}%</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground print:hidden">
            Average is taken over the subjects each student was actually examined in, so a student missing one subject&apos;s result isn&apos;t penalized with a zero.
          </p>
        </SectionCard>
      )}
    </div>
  );
}
