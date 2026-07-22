import { Lock } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getHrSummary } from "@/modules/hr/service";

export default async function HrReportsPage() {
  const tenant = await requireModuleAccess("hr");

  if (!hasPermission(tenant, PERMISSIONS.HR_REPORTS_VIEW)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Reports" description="Headcount, leave, and review summaries." />
        <EmptyState icon={Lock} title="You don't have access to this page" description="HR reports are limited to roles with reporting permissions." />
      </div>
    );
  }

  const summary = await getHrSummary(tenant.organizationId);

  const stats = [
    { label: "Total employees", value: summary.totalEmployees },
    { label: "Active", value: summary.activeEmployeeCount },
    { label: "Onboarding", value: summary.onboardingCount },
    { label: "On leave", value: summary.onLeaveCount },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Headcount, leave, and review summaries." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <CardTitle className="text-2xl">{stat.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Headcount by department</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {Object.keys(summary.departmentCounts).length === 0 ? (
            <p className="text-sm text-muted-foreground">No employees yet.</p>
          ) : (
            Object.entries(summary.departmentCounts).map(([department, count]) => (
              <div key={department} className="flex items-center justify-between rounded-lg border p-3">
                <p className="text-sm font-medium">{department}</p>
                <p className="text-sm text-muted-foreground">{count}</p>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pending activity</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">Pending leave requests</p>
            <p className="text-lg font-medium">{summary.pendingLeaveCount}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Draft reviews</p>
            <p className="text-lg font-medium">{summary.draftReviewCount}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
