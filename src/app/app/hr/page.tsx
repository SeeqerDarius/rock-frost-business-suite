import { UsersRound, UserPlus, CalendarClock, ClipboardCheck } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { OverviewMetricCard } from "@/components/dashboard/overview-metric-card";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { getHrSummary } from "@/modules/hr/service";

export default async function HrOverviewPage() {
  const tenant = await requireModuleAccess("hr");
  const summary = await getHrSummary(tenant.organizationId);

  const stats = [
    { label: "Active employees", value: summary.activeEmployeeCount, description: "Employees currently on record", icon: <UsersRound className="size-4" />, href: "/app/hr/employees" },
    { label: "In onboarding", value: summary.onboardingCount, description: "Employees still completing onboarding", icon: <UserPlus className="size-4" />, href: "/app/hr/employees" },
    { label: "Pending leave requests", value: summary.pendingLeaveCount, description: "Leave requests awaiting a decision", icon: <CalendarClock className="size-4" />, href: "/app/hr/leave" },
    { label: "Draft reviews", value: summary.draftReviewCount, description: "Performance reviews not yet finalized", icon: <ClipboardCheck className="size-4" />, href: "/app/hr/reviews" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="HR Overview" description="Headcount, onboarding, leave, and performance review activity at a glance." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => <OverviewMetricCard key={stat.label} {...stat} />)}
      </div>
    </div>
  );
}
