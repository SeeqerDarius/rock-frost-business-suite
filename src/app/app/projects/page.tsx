import { FolderKanban, ListTodo, AlertTriangle, Flag } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { OverviewMetricCard } from "@/components/dashboard/overview-metric-card";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { getProjectsSummary } from "@/modules/projects/service";

export default async function ProjectsOverviewPage() {
  const tenant = await requireModuleAccess("projects");
  const summary = await getProjectsSummary(tenant.organizationId);

  const stats = [
    { label: "Active projects", value: summary.activeProjectCount, description: "Projects currently in progress", icon: <FolderKanban className="size-4" />, href: "/app/projects/projects" },
    { label: "Open tasks", value: summary.totalTaskCount - (summary.tasksByStatus.DONE ?? 0), description: "Tasks not yet marked done", icon: <ListTodo className="size-4" />, href: "/app/projects/tasks" },
    { label: "Overdue tasks", value: summary.overdueTaskCount, description: "Tasks past their due date", icon: <AlertTriangle className="size-4" />, href: "/app/projects/tasks" },
    { label: "Total projects", value: summary.totalProjectCount, description: "Projects tracked across the organization", icon: <Flag className="size-4" />, href: "/app/projects/milestones" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Projects Overview" description="Project status, task load, and team workload at a glance." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => <OverviewMetricCard key={stat.label} {...stat} />)}
      </div>
    </div>
  );
}
