import Link from "next/link";
import { FolderKanban, ListTodo, AlertTriangle, Flag } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireCurrentTenant } from "@/lib/tenant";
import { getProjectsSummary } from "@/modules/projects/service";

export default async function ProjectsOverviewPage() {
  const tenant = await requireCurrentTenant();
  const summary = await getProjectsSummary(tenant.organizationId);

  const stats = [
    { label: "Active projects", value: summary.activeProjectCount, icon: FolderKanban, href: "/app/projects/projects" },
    { label: "Open tasks", value: summary.totalTaskCount - (summary.tasksByStatus.DONE ?? 0), icon: ListTodo, href: "/app/projects/tasks" },
    { label: "Overdue tasks", value: summary.overdueTaskCount, icon: AlertTriangle, href: "/app/projects/tasks" },
    { label: "Total projects", value: summary.totalProjectCount, icon: Flag, href: "/app/projects/milestones" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Projects Overview" description="Project status, task load, and team workload at a glance." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardDescription>{stat.label}</CardDescription>
                <stat.icon className="size-4 text-muted-foreground" />
              </div>
              <CardTitle className="text-3xl">{stat.value}</CardTitle>
            </CardHeader>
            <CardContent>
              <Button size="sm" variant="outline" nativeButton={false} render={<Link href={stat.href as never} />}>
                View
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
