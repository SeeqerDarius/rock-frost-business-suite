import { FolderKanban, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listProjects, listAssignableUsers } from "@/modules/projects/service";
import {
  upsertProject,
  changeProjectStatus,
  completeExistingProject,
  addMemberToProject,
  removeMemberFromProject,
} from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage projects.",
  "missing-fields": "All required fields must be filled in.",
  "not-ready": "This project can't be completed until every milestone is completed.",
  "not-found": "That project, member, or role could not be found.",
};

const STATUS_BADGE: Record<string, "default" | "outline" | "destructive" | "secondary"> = {
  PLANNING: "outline",
  ACTIVE: "secondary",
  ON_HOLD: "destructive",
  COMPLETED: "default",
  CANCELLED: "destructive",
};

interface ProjectFieldsProps {
  project?: { name: string; description: string | null; startDate: Date | null; endDate: Date | null; budget: string; ownerId: string | null };
  ownerItems: Record<string, string>;
}

function ProjectFields({ project, ownerItems }: ProjectFieldsProps) {
  const idSuffix = project ? "-edit" : "";
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={`name${idSuffix}`}>Name</Label>
        <Input id={`name${idSuffix}`} name="name" defaultValue={project?.name} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`description${idSuffix}`}>Description</Label>
        <Textarea id={`description${idSuffix}`} name="description" defaultValue={project?.description ?? ""} rows={3} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`startDate${idSuffix}`}>Start date</Label>
          <Input id={`startDate${idSuffix}`} name="startDate" type="date" defaultValue={project?.startDate ? project.startDate.toISOString().slice(0, 10) : ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`endDate${idSuffix}`}>End date</Label>
          <Input id={`endDate${idSuffix}`} name="endDate" type="date" defaultValue={project?.endDate ? project.endDate.toISOString().slice(0, 10) : ""} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`budget${idSuffix}`}>Budget</Label>
          <Input id={`budget${idSuffix}`} name="budget" type="number" step="0.01" defaultValue={project?.budget ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`ownerId${idSuffix}`}>Owner</Label>
          <Select name="ownerId" defaultValue={project?.ownerId ?? ""} items={{ "": "Unassigned", ...ownerItems }}>
            <SelectTrigger id={`ownerId${idSuffix}`} className="w-full">
              <SelectValue placeholder="Unassigned" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Unassigned</SelectItem>
              {Object.entries(ownerItems).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </>
  );
}

export default async function ProjectsListPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const tenant = await requireCurrentTenant();
  const canManage = hasPermission(tenant, PERMISSIONS.PROJECTS_PROJECTS_MANAGE);
  const [projects, users] = await Promise.all([listProjects(tenant.organizationId), listAssignableUsers(tenant.organizationId)]);
  const ownerItems: Record<string, string> = Object.fromEntries(users.map((u) => [u.id, u.name ?? u.email]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader title="Projects" description="Every project your organization is running." />
        {canManage ? (
          <EntityDialog trigger={<Button size="sm"><Plus />New project</Button>} title="New project" action={upsertProject}>
            <ProjectFields ownerItems={ownerItems} />
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

      {projects.length === 0 ? (
        <EmptyState icon={FolderKanban} title="No projects yet" description="Projects you create will appear here." />
      ) : (
        <div className="space-y-3">
          {projects.map((project) => {
            const openTasks = project.tasks.filter((t) => t.status !== "DONE").length;
            const memberIds = new Set(project.members.map((m) => m.userId));
            const availableUsers: Record<string, string> = Object.fromEntries(
              users.filter((u) => !memberIds.has(u.id)).map((u) => [u.id, u.name ?? u.email]),
            );
            const canComplete = project.status !== "COMPLETED" && project.status !== "CANCELLED";

            return (
              <div key={project.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">
                      {project.code} - {project.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {project.owner ? `Owner: ${project.owner.name ?? project.owner.email}` : "No owner"} · {openTasks} open task{openTasks === 1 ? "" : "s"} · {project.milestones.length} milestone{project.milestones.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <Badge variant={STATUS_BADGE[project.status]}>{project.status.replace("_", " ")}</Badge>
                </div>

                {project.members.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {project.members.map((member) => (
                      <Badge key={member.userId} variant="outline" className="gap-1">
                        {member.user.name ?? member.user.email}
                        {member.role ? ` (${member.role})` : ""}
                        {canManage ? (
                          <form action={removeMemberFromProject} className="inline">
                            <input type="hidden" name="projectId" value={project.id} />
                            <input type="hidden" name="userId" value={member.userId} />
                            <button type="submit" className="ml-1 text-muted-foreground hover:text-destructive">
                              ×
                            </button>
                          </form>
                        ) : null}
                      </Badge>
                    ))}
                  </div>
                ) : null}

                {canManage ? (
                  <div className="mt-2 flex flex-wrap justify-end gap-1">
                    {Object.keys(availableUsers).length > 0 ? (
                      <EntityDialog
                        trigger={<Button size="sm" variant="ghost">Add member</Button>}
                        title={`Add member to ${project.name}`}
                        action={addMemberToProject}
                        submitLabel="Add member"
                      >
                        <input type="hidden" name="projectId" value={project.id} />
                        <div className="space-y-2">
                          <Label htmlFor={`userId-${project.id}`}>User</Label>
                          <Select name="userId" items={availableUsers}>
                            <SelectTrigger id={`userId-${project.id}`} className="w-full">
                              <SelectValue placeholder="Select a user" />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(availableUsers).map(([value, label]) => (
                                <SelectItem key={value} value={value}>
                                  {label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor={`role-${project.id}`}>Role (optional)</Label>
                          <Input id={`role-${project.id}`} name="role" placeholder="e.g. Developer, Designer" />
                        </div>
                      </EntityDialog>
                    ) : null}
                    {project.status === "PLANNING" || project.status === "ON_HOLD" ? (
                      <form action={changeProjectStatus}>
                        <input type="hidden" name="id" value={project.id} />
                        <input type="hidden" name="status" value="ACTIVE" />
                        <Button type="submit" size="sm" variant="ghost">Activate</Button>
                      </form>
                    ) : null}
                    {project.status === "ACTIVE" ? (
                      <form action={changeProjectStatus}>
                        <input type="hidden" name="id" value={project.id} />
                        <input type="hidden" name="status" value="ON_HOLD" />
                        <Button type="submit" size="sm" variant="ghost">Put on hold</Button>
                      </form>
                    ) : null}
                    {canComplete ? (
                      <form action={completeExistingProject}>
                        <input type="hidden" name="id" value={project.id} />
                        <Button type="submit" size="sm" variant="ghost">Complete</Button>
                      </form>
                    ) : null}
                    <EntityDialog
                      trigger={<Button size="sm" variant="ghost">Edit</Button>}
                      title="Edit project"
                      action={upsertProject}
                      submitLabel="Save changes"
                    >
                      <input type="hidden" name="id" value={project.id} />
                      <ProjectFields
                        project={{ ...project, budget: project.budget?.toString() ?? "" }}
                        ownerItems={ownerItems}
                      />
                    </EntityDialog>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
