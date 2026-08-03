import { Users, Shapes, Receipt, Library, ClipboardCheck, GraduationCap, CalendarClock } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { OverviewMetricCard } from "@/components/dashboard/overview-metric-card";
import { WorkflowLinks } from "@/components/dashboard/workflow-links";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { getSchoolSummary } from "@/modules/school/service";

export default async function SchoolOverviewPage() {
  const tenant = await requireModuleAccess("school");
  const summary = await getSchoolSummary(tenant.organizationId);
  const stats = [
    { label: "Active students", value: summary.activeStudents, description: "Currently enrolled learners", icon: <Users className="size-4" />, href: "/app/school/students" },
    { label: "Active classes", value: summary.activeClasses, description: "Classes available for enrollment", icon: <Shapes className="size-4" />, href: "/app/school/classes" },
    { label: "Outstanding fees", value: new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS" }).format(Number(summary.outstanding)), description: "Open student fee balances", icon: <Receipt className="size-4" />, href: "/app/school/fees" },
    { label: "Overdue library loans", value: summary.overdueLoans, description: "Loans beyond their due date", icon: <Library className="size-4" />, href: "/app/school/library" },
  ];
  const workflows = [
    { title: "Record attendance", description: "Capture daily attendance and review class participation.", href: "/app/school/attendance", icon: <ClipboardCheck /> },
    { title: "Manage examinations", description: "Move results through entry, moderation, and publishing.", href: "/app/school/exams", icon: <GraduationCap /> },
    { title: "Plan timetables", description: "Coordinate class schedules, rooms, subjects, and teachers.", href: "/app/school/timetables", icon: <CalendarClock /> },
  ];
  return (
    <div className="mx-auto max-w-screen-2xl space-y-6">
      <PageHeader title="School Overview" description="Enrollment, attendance, fees, academics, and campus services at a glance." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{stats.map((stat) => <OverviewMetricCard key={stat.label} {...stat} />)}</div>
      <WorkflowLinks title="Academic operations" description="Continue the highest-frequency academic and administrative workflows." items={workflows} />
    </div>
  );
}
