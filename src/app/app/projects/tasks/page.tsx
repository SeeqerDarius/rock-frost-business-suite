import { ListTodo, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listTasks, listProjects, listMilestones, listAssignableUsers } from "@/modules/projects/service";
import { createNewTask, changeTaskStatus } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage tasks.",
  "missing-fields": "Project and title are required.",
};

const STATUS_LABELS: Record<string, string> = { TODO: "To do", IN_PROGRESS: "In progress", IN_REVIEW: "In review", DONE: "Done" };
const STATUS_BADGE: Record<string, "default" | "outline" | "destructive" | "secondary"> = {
  TODO: "outline",
  IN_PROGRESS: "secondary",
  IN_REVIEW: "secondary",
  DONE: "default",
};
const PRIORITY_LABELS: Record<string, string> = { LOW: "Low", MEDIUM: "Medium", HIGH: "High", URGENT: "Urgent" };
const PRIORITY_BADGE: Record<string, "default" | "outline" | "destructive" | "secondary"> = {
  LOW: "outline",
  MEDIUM: "secondary",
  HIGH: "default",
  URGENT: "destructive",
};
const NEXT_STATUS: Record<string, string | null> = { TODO: "IN_PROGRESS", IN_PROGRESS: "IN_REVIEW", IN_REVIEW: "DONE", DONE: null };

export default async function ProjectsTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const tenant = await requireCurrentTenant();
  const canManage = hasPermission(tenant, PERMISSIONS.PROJECTS_TASKS_MANAGE);
  const [tasks, projects, milestones, users] = await Promise.all([
    listTasks(tenant.organizationId),
    listProjects(tenant.organizationId),
    listMilestones(tenant.organizationId),
    listAssignableUsers(tenant.organizationId),
  ]);
  const projectItems: Record<string, string> = Object.fromEntries(projects.map((p) => [p.id, `${p.code} — ${p.name}`]));
  const milestoneItems: Record<string, string> = Object.fromEntries(milestones.map((m) => [m.id, `${m.project.code}: ${m.name}`]));
  const assigneeItems: Record<string, string> = Object.fromEntries(users.map((u) => [u.id, u.name ?? u.email]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader title="Tasks" description="Work items across every project." />
        {canManage ? (
          <EntityDialog trigger={<Button size="sm"><Plus />New task</Button>} title="New task" action={createNewTask}>
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
              <Label htmlFor="milestoneId">Milestone (optional)</Label>
              <Select name="milestoneId" defaultValue="" items={{ "": "None", ...milestoneItems }}>
                <SelectTrigger id="milestoneId" className="w-full">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {Object.entries(milestoneItems).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input id="title" name="title" required />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="priority">Priority</Label>
                <Select name="priority" defaultValue="MEDIUM" items={PRIORITY_LABELS}>
                  <SelectTrigger id="priority" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="dueDate">Due date</Label>
                <Input id="dueDate" name="dueDate" type="date" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="assigneeId">Assignee</Label>
              <Select name="assigneeId" defaultValue="" items={{ "": "Unassigned", ...assigneeItems }}>
                <SelectTrigger id="assigneeId" className="w-full">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Unassigned</SelectItem>
                  {Object.entries(assigneeItems).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" name="description" rows={3} />
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

      {tasks.length === 0 ? (
        <EmptyState icon={ListTodo} title="No tasks yet" description="Tasks you create will appear here." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Project</TableHead>
              <TableHead>Assignee</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Status</TableHead>
              {canManage ? <TableHead /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.map((task) => {
              const nextStatus = NEXT_STATUS[task.status];
              return (
                <TableRow key={task.id}>
                  <TableCell className="font-medium">{task.title}</TableCell>
                  <TableCell className="text-muted-foreground">{task.project.code}</TableCell>
                  <TableCell className="text-muted-foreground">{task.assignee?.name ?? task.assignee?.email ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={PRIORITY_BADGE[task.priority]}>{PRIORITY_LABELS[task.priority]}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{task.dueDate ? task.dueDate.toLocaleDateString() : "—"}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_BADGE[task.status]}>{STATUS_LABELS[task.status]}</Badge>
                  </TableCell>
                  {canManage ? (
                    <TableCell className="text-right">
                      {nextStatus ? (
                        <form action={changeTaskStatus}>
                          <input type="hidden" name="id" value={task.id} />
                          <input type="hidden" name="status" value={nextStatus} />
                          <Button type="submit" size="sm" variant="ghost">
                            Move to {STATUS_LABELS[nextStatus]}
                          </Button>
                        </form>
                      ) : null}
                    </TableCell>
                  ) : null}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
