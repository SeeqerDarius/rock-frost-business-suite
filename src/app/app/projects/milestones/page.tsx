import { Flag, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listMilestones, listProjects } from "@/modules/projects/service";
import { createNewMilestone, completeExistingMilestone } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage milestones.",
  "missing-fields": "Project and name are required.",
  "not-ready": "Every task under this milestone must be done before it can be completed.",
};

export default async function ProjectsMilestonesPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const tenant = await requireCurrentTenant();
  const canManage = hasPermission(tenant, PERMISSIONS.PROJECTS_MILESTONES_MANAGE);
  const [milestones, projects] = await Promise.all([
    listMilestones(tenant.organizationId),
    listProjects(tenant.organizationId),
  ]);
  const projectItems: Record<string, string> = Object.fromEntries(projects.map((p) => [p.id, `${p.code} — ${p.name}`]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader title="Milestones" description="Checkpoints within each project." />
        {canManage ? (
          <EntityDialog trigger={<Button size="sm"><Plus />New milestone</Button>} title="New milestone" action={createNewMilestone}>
            <div className="space-y-2">
              <Label htmlFor="projectId">Project</Label>
              <Select name="projectId" items={projectItems}>
                <SelectTrigger id="projectId" className="w-full">
                  <SelectValue placeholder="Select a project" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(projectItems).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dueDate">Due date</Label>
              <Input id="dueDate" name="dueDate" type="date" />
            </div>
          </EntityDialog>
        ) : null}
      </div>

      {saved ? (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
          Saved.
        </div>
      ) : null}
      {error && ERROR_MESSAGES[error] ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {ERROR_MESSAGES[error]}
        </div>
      ) : null}

      {milestones.length === 0 ? (
        <EmptyState icon={Flag} title="No milestones yet" description="Milestones you create will appear here." />
      ) : (
        <div className="space-y-3">
          {milestones.map((milestone) => {
            const doneCount = milestone.tasks.filter((t) => t.status === "DONE").length;
            return (
              <div key={milestone.id} className="flex items-center justify-between gap-4 rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">
                    {milestone.project.code}: {milestone.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {milestone.dueDate ? `Due ${milestone.dueDate.toLocaleDateString()} · ` : ""}
                    {doneCount} / {milestone.tasks.length} tasks done
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={milestone.status === "COMPLETED" ? "default" : "outline"}>{milestone.status}</Badge>
                  {canManage && milestone.status === "PENDING" ? (
                    <form action={completeExistingMilestone}>
                      <input type="hidden" name="id" value={milestone.id} />
                      <Button type="submit" size="sm" variant="ghost">Complete</Button>
                    </form>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
