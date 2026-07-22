import { Lock, UsersRound } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getPeopleOverview } from "@/modules/analytics/service";

export default async function AnalyticsPeoplePage() {
  const tenant = await requireModuleAccess("analytics");

  if (!hasPermission(tenant, PERMISSIONS.ANALYTICS_PEOPLE_VIEW)) {
    return (
      <div className="space-y-6">
        <PageHeader title="People" description="Human Resources rolled up." />
        <EmptyState icon={Lock} title="You don't have access to this page" description="People analytics are limited to roles with HR-reporting permissions." />
      </div>
    );
  }

  const { hr } = await getPeopleOverview(tenant.organizationId, tenant.enabledModuleKeys);

  if (!hr) {
    return (
      <div className="space-y-6">
        <PageHeader title="People" description="Human Resources rolled up." />
        <EmptyState icon={UsersRound} title="HR module not enabled" description="Enable Human Resources for this organization to see people analytics here." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="People" description="Human Resources rolled up." />

      <Card>
        <CardHeader>
          <CardTitle>Headcount</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Total employees</p>
            <p className="text-lg font-medium">{hr.totalEmployees}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Active</p>
            <p className="text-lg font-medium">{hr.activeEmployeeCount}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Onboarding</p>
            <p className="text-lg font-medium">{hr.onboardingCount}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">On leave</p>
            <p className="text-lg font-medium">{hr.onLeaveCount}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Pending leave requests</p>
            <p className="text-lg font-medium">{hr.pendingLeaveCount}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Draft reviews</p>
            <p className="text-lg font-medium">{hr.draftReviewCount}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Headcount by department</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {Object.keys(hr.departmentCounts).length === 0 ? (
            <p className="text-sm text-muted-foreground">No employees yet.</p>
          ) : (
            Object.entries(hr.departmentCounts).map(([department, count]) => (
              <div key={department} className="flex items-center justify-between rounded-lg border p-3">
                <p className="text-sm font-medium">{department}</p>
                <p className="text-sm text-muted-foreground">{count}</p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
