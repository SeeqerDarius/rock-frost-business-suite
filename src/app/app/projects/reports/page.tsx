import { Lock } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getProjectsSummary } from "@/modules/projects/service";

const PROJECT_STATUS_LABELS: Record<string, string> = {
  PLANNING: "Planning",
  ACTIVE: "Active",
  ON_HOLD: "On hold",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

const TASK_STATUS_LABELS: Record<string, string> = { TODO: "To do", IN_PROGRESS: "In progress", IN_REVIEW: "In review", DONE: "Done" };

export default async function ProjectsReportsPage() {
  const tenant = await requireCurrentTenant();

  if (!hasPermission(tenant, PERMISSIONS.PROJECTS_REPORTS_VIEW)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Reports" description="Project status, task load, and team workload summaries." />
        <EmptyState icon={Lock} title="You don't have access to this page" description="Projects reports are limited to roles with reporting permissions." />
      </div>
    );
  }

  const summary = await getProjectsSummary(tenant.organizationId);

  const stats = [
    { label: "Active projects", value: summary.activeProjectCount },
    { label: "Total projects", value: summary.totalProjectCount },
    { label: "Total tasks", value: summary.totalTaskCount },
    { label: "Overdue tasks", value: summary.overdueTaskCount },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Project status, task load, and team workload summaries." />

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
          <CardTitle>Projects by status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {Object.entries(PROJECT_STATUS_LABELS).map(([status, label]) => (
            <div key={status} className="flex items-center justify-between rounded-lg border p-3">
              <p className="text-sm font-medium">{label}</p>
              <p className="text-sm text-muted-foreground">{summary.projectsByStatus[status] ?? 0}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tasks by status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {Object.entries(TASK_STATUS_LABELS).map(([status, label]) => (
            <div key={status} className="flex items-center justify-between rounded-lg border p-3">
              <p className="text-sm font-medium">{label}</p>
              <p className="text-sm text-muted-foreground">{summary.tasksByStatus[status] ?? 0}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Team workload (open tasks)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {summary.workload.length === 0 ? (
            <p className="text-sm text-muted-foreground">No open tasks assigned to anyone yet.</p>
          ) : (
            summary.workload.map((entry) => (
              <div key={entry.name} className="flex items-center justify-between rounded-lg border p-3">
                <p className="text-sm font-medium">{entry.name}</p>
                <p className="text-sm text-muted-foreground">{entry.openTaskCount} open task{entry.openTaskCount === 1 ? "" : "s"}</p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
