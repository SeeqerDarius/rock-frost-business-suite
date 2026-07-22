import Link from "next/link";
import { FolderKanban } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { getProjectsSummary } from "@/modules/projects/service";

export async function ProjectsDashboardWidget() {
  const tenant = await requireModuleAccess("projects");
  const summary = await getProjectsSummary(tenant.organizationId);
  const openTasks = summary.totalTaskCount - (summary.tasksByStatus.DONE ?? 0);

  return (
    <Card>
      <CardHeader>
        <FolderKanban className="size-6 text-muted-foreground" />
        <CardTitle className="mt-3">Project Management</CardTitle>
        <CardDescription>
          {summary.activeProjectCount} active project{summary.activeProjectCount === 1 ? "" : "s"} · {openTasks} open task{openTasks === 1 ? "" : "s"} · {summary.overdueTaskCount} overdue
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/app/projects" />}>
          Open Projects
        </Button>
      </CardContent>
    </Card>
  );
}
