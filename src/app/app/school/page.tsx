import { AlertTriangle, BookOpenCheck, Bus, CalendarCheck, ClipboardCheck, GraduationCap, Library, Receipt, Shapes, UserRoundCheck, Users } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { OverviewMetricCard } from "@/components/dashboard/overview-metric-card";
import { WorkflowLinks } from "@/components/dashboard/workflow-links";
import { PrerequisiteNotice, SectionCard } from "@/components/school/section-card";
import { formatMoney } from "@/components/school/format";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getSchoolAcademicSetup } from "@/modules/school/service";
import { getSchoolOperationalDashboard } from "@/modules/school/dashboard-service";

const rate = (counts: Record<string, number>) => {
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  return total ? { value: Math.round(((counts.PRESENT ?? 0) + (counts.LATE ?? 0)) / total * 100), total } : null;
};

export default async function SchoolOverviewPage() {
  const tenant = await requireModuleAccess("school");
  const canFinance = hasPermission(tenant, PERMISSIONS.SCHOOL_DASHBOARD_FINANCIAL_VIEW);
  const canAnalytics = hasPermission(tenant, PERMISSIONS.SCHOOL_ANALYTICS_VIEW);
  const canAttendance = hasPermission(tenant, PERMISSIONS.SCHOOL_ATTENDANCE_VIEW);
  const [dashboard, [years, classes]] = await Promise.all([getSchoolOperationalDashboard(tenant.organizationId, { financial: canFinance, analytics: canAnalytics }), getSchoolAcademicSetup(tenant.organizationId)]);
  const todayRate = rate(dashboard.attendanceToday);
  const termRate = rate(dashboard.attendanceTerm);
  const money = (value: Parameters<typeof formatMoney>[0]) => formatMoney(value, tenant.organization.currency);
  const stats = [
    { label: "Active students", value: dashboard.activeStudents, description: "Active student records now", icon: <Users className="size-4" />, href: "/app/school/students?status=ACTIVE" },
    { label: "New admissions", value: dashboard.newAdmissions, description: dashboard.period ? `Since ${dashboard.period} began` : "No current academic period", icon: <UserRoundCheck className="size-4" />, href: "/app/school/students" },
    ...(canAttendance ? [{ label: "Attendance today", value: todayRate ? `${todayRate.value}%` : "No register", description: todayRate ? `${todayRate.total} published marks today` : "No attendance marks today", icon: <CalendarCheck className="size-4" />, href: "/app/school/attendance" }] : []),
    ...(dashboard.finance ? [{ label: "Current-term collected", value: money(dashboard.finance.collected ?? 0), description: "Confirmed, non-refunded payments", icon: <Receipt className="size-4" />, href: "/app/school/fees" }] : []),
  ];
  const actions = [
    ...(canAttendance && dashboard.incompleteRegisters ? [{ title: `${dashboard.incompleteRegisters} incomplete registers`, description: "Active classes without attendance marks today.", href: "/app/school/attendance", icon: <ClipboardCheck /> }] : []),
    ...(dashboard.missingProfiles ? [{ title: `${dashboard.missingProfiles} incomplete student profiles`, description: "Active records missing a photo, date of birth, or guardian.", href: "/app/school/students", icon: <AlertTriangle /> }] : []),
    ...(dashboard.uncoveredClasses ? [{ title: `${dashboard.uncoveredClasses} classes without teacher coverage`, description: "Assign teachers to active classes.", href: "/app/school/classes", icon: <Shapes /> }] : []),
    ...(dashboard.overdueLoans ? [{ title: `${dashboard.overdueLoans} overdue library loans`, description: "Follow up on books beyond their due date.", href: "/app/school/library", icon: <Library /> }] : []),
    ...(dashboard.transportGaps ? [{ title: `${dashboard.transportGaps} students without transport assignment`, description: "Review students who require school transport.", href: "/app/school/transport", icon: <Bus /> }] : []),
  ];
  return <div className="mx-auto max-w-screen-2xl space-y-6">
    <PageHeader title="School Operations" description="Enrollment, attendance, academic, finance, and service exceptions that need action." />
    <PrerequisiteNotice items={[{ satisfied: years.length > 0, label: "Create an academic year", href: "/app/school/academic-periods" }, { satisfied: classes.length > 0, label: "Create a class", href: "/app/school/classes" }]} />
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground"><p>Period: <span className="font-medium text-foreground">{dashboard.period ?? "No current academic period"}</span></p><p>Updated {new Intl.DateTimeFormat("en-GH", { dateStyle: "medium", timeStyle: "short" }).format(dashboard.refreshedAt)}</p></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{stats.map((stat) => <OverviewMetricCard key={stat.label} {...stat} />)}</div>
    <div className="grid gap-6 lg:grid-cols-2">
      {canAttendance ? <SectionCard title="Attendance coverage" description="Published attendance marks for today and the current term."><dl className="grid grid-cols-2 gap-3"><div className="rounded-lg border p-3"><dt className="text-xs text-muted-foreground">Today</dt><dd className="mt-1 text-xl font-semibold">{todayRate ? `${todayRate.value}% of ${todayRate.total}` : "No data"}</dd></div><div className="rounded-lg border p-3"><dt className="text-xs text-muted-foreground">Current term</dt><dd className="mt-1 text-xl font-semibold">{termRate ? `${termRate.value}% of ${termRate.total}` : "No data"}</dd></div></dl></SectionCard> : null}
      {dashboard.finance ? <SectionCard title="Current-term fee position" description="Billed, collected, and outstanding remain separate."><dl className="grid gap-3 sm:grid-cols-3"><div className="rounded-lg border p-3"><dt className="text-xs text-muted-foreground">Billed</dt><dd className="mt-1 text-lg font-semibold">{money(dashboard.finance.billed ?? 0)}</dd></div><div className="rounded-lg border p-3"><dt className="text-xs text-muted-foreground">Collected</dt><dd className="mt-1 text-lg font-semibold">{money(dashboard.finance.collected ?? 0)}</dd></div><div className="rounded-lg border p-3"><dt className="text-xs text-muted-foreground">Outstanding</dt><dd className="mt-1 text-lg font-semibold">{money(dashboard.finance.outstanding ?? 0)}</dd></div></dl></SectionCard> : null}
    </div>
    {actions.length ? <WorkflowLinks title="Requires attention" description="Open the underlying records and resolve operational gaps." items={actions} /> : <SectionCard title="Requires attention" description="Exception queues from the current operational period."><p className="text-sm text-muted-foreground">No current exceptions are available for your permissions.</p></SectionCard>}
    <WorkflowLinks title="Academic operations" description="Continue the highest-frequency academic workflows." items={[{ title: "Record attendance", description: "Capture and review class registers.", href: "/app/school/attendance", icon: <ClipboardCheck /> }, { title: "Manage examinations", description: "Enter, moderate, and publish results.", href: "/app/school/exams", icon: <GraduationCap /> }, { title: "Review reports", description: "Inspect published academic and operational records.", href: "/app/school/reports", icon: <BookOpenCheck /> }]} />
  </div>;
}
