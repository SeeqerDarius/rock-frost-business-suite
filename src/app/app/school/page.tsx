import { Users, Shapes, Receipt, Library, ClipboardCheck, GraduationCap, CalendarClock } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { OverviewMetricCard } from "@/components/dashboard/overview-metric-card";
import { WorkflowLinks } from "@/components/dashboard/workflow-links";
import { PrerequisiteNotice, SectionCard } from "@/components/school/section-card";
import { formatMoney } from "@/components/school/format";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { getSchoolAcademicSetup, getSchoolSummary } from "@/modules/school/service";

export default async function SchoolOverviewPage() {
  const tenant = await requireModuleAccess("school");
  const [summary, [years, classes]] = await Promise.all([getSchoolSummary(tenant.organizationId), getSchoolAcademicSetup(tenant.organizationId)]);

  const stats = [
    { label: "Active students", value: summary.activeStudents, description: "Currently enrolled learners", icon: <Users className="size-4" />, href: "/app/school/students" },
    { label: "Active classes", value: summary.activeClasses, description: "Classes available for enrollment", icon: <Shapes className="size-4" />, href: "/app/school/classes" },
    { label: "Outstanding fees", value: formatMoney(summary.outstanding), description: "Open student fee balances", icon: <Receipt className="size-4" />, href: "/app/school/fees" },
    { label: "Overdue library loans", value: summary.overdueLoans, description: "Loans beyond their due date", icon: <Library className="size-4" />, href: "/app/school/library" },
  ];

  const workflows = [
    { title: "Record attendance", description: "Capture daily attendance and review class participation.", href: "/app/school/attendance", icon: <ClipboardCheck /> },
    { title: "Manage examinations", description: "Move results through entry, moderation, and publishing.", href: "/app/school/exams", icon: <GraduationCap /> },
    { title: "Plan timetables", description: "Coordinate class schedules, rooms, subjects, and teachers.", href: "/app/school/timetables", icon: <CalendarClock /> },
  ];

  const marked = Object.values(summary.attendance).reduce((total, count) => total + count, 0);
  const present = (summary.attendance.PRESENT ?? 0) + (summary.attendance.LATE ?? 0);
  const attendanceRate = marked > 0 ? Math.round((present / marked) * 100) : null;
  const currentYear = years.find((year) => year.current);
  const currentTerm = currentYear?.terms.find((term) => term.current);

  return (
    <div className="mx-auto max-w-screen-2xl space-y-6">
      <PageHeader
        title="School Overview"
        description="Enrollment, attendance, fees, academics, and campus services at a glance."
      />

      {/* A brand-new school lands here first; point it at the setup records everything else depends on. */}
      <PrerequisiteNotice
        items={[
          { satisfied: years.length > 0, label: "Create an academic year", href: "/app/school/academic-periods" },
          { satisfied: classes.length > 0, label: "Create a class", href: "/app/school/classes" },
        ]}
      />

      {currentYear ? (
        <p className="text-sm text-muted-foreground">
          Current academic year: <span className="font-medium text-foreground">{currentYear.name}</span>
          {currentTerm ? <> · Current term: <span className="font-medium text-foreground">{currentTerm.name}</span></> : " · No current term is set"}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => <OverviewMetricCard key={stat.label} {...stat} />)}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Attendance to date" description="Across every attendance record captured so far.">
          {marked === 0 ? (
            <p className="text-sm text-muted-foreground">No attendance has been recorded yet.</p>
          ) : (
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Attendance rate", value: `${attendanceRate}%` },
                { label: "Present", value: summary.attendance.PRESENT ?? 0 },
                { label: "Absent", value: summary.attendance.ABSENT ?? 0 },
                { label: "Late", value: summary.attendance.LATE ?? 0 },
              ].map((item) => (
                <div key={item.label} className="rounded-lg border p-3">
                  <dt className="text-xs text-muted-foreground">{item.label}</dt>
                  <dd className="mt-1 text-xl font-semibold tabular-nums">{item.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </SectionCard>

        <SectionCard title="Fee position" description="Collections and arrears across all campuses.">
          <dl className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border p-3">
              <dt className="text-xs text-muted-foreground">Collected</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums">{formatMoney(summary.collections)}</dd>
            </div>
            <div className="rounded-lg border p-3">
              <dt className="text-xs text-muted-foreground">Outstanding</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums">{formatMoney(summary.outstanding)}</dd>
            </div>
          </dl>
        </SectionCard>
      </div>

      <WorkflowLinks title="Academic operations" description="Continue the highest-frequency academic and administrative workflows." items={workflows} />
    </div>
  );
}
