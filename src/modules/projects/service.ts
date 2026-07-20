import "server-only";

import { db } from "@/lib/db";
import type { ProjectTaskStatus, ProjectTaskPriority } from "@prisma/client";

/**
 * Fresh module (no reference implementation to migrate from). Every function
 * takes organizationId explicitly and filters on it, per docs/MODULE_BOUNDARIES.md.
 */

export async function listAssignableUsers(organizationId: string) {
  const members = await db.organizationMember.findMany({
    where: { organizationId, status: "ACTIVE" },
    include: { user: true },
    orderBy: { user: { name: "asc" } },
  });
  return members.map((m) => m.user);
}

// --- Projects ---

async function generateProjectCode(organizationId: string) {
  const count = await db.project.count({ where: { organizationId } });
  return `PRJ-${String(count + 1).padStart(4, "0")}`;
}

export function listProjects(organizationId: string) {
  return db.project.findMany({
    where: { organizationId },
    include: { owner: true, members: { include: { user: true } }, tasks: true, milestones: true },
    orderBy: { createdAt: "desc" },
  });
}

interface ProjectInput {
  name: string;
  description?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
  budget?: string | null;
  ownerId?: string | null;
}

export async function createProject(organizationId: string, data: ProjectInput) {
  const code = await generateProjectCode(organizationId);
  return db.project.create({ data: { organizationId, code, ...data } });
}

export function updateProject(organizationId: string, id: string, data: ProjectInput) {
  return db.project.update({ where: { id, organizationId }, data });
}

export class ProjectStateError extends Error {}

export async function completeProject(organizationId: string, id: string) {
  const project = await db.project.findFirst({ where: { id, organizationId }, include: { milestones: true } });
  if (!project) throw new Error("Project not found.");
  if (project.status === "COMPLETED" || project.status === "CANCELLED") {
    throw new ProjectStateError("This project is already closed.");
  }
  const incomplete = project.milestones.filter((m) => m.status !== "COMPLETED");
  if (incomplete.length > 0) {
    throw new ProjectStateError(`${incomplete.length} milestone(s) are not yet completed.`);
  }
  return db.project.update({ where: { id }, data: { status: "COMPLETED" } });
}

export function setProjectStatus(organizationId: string, id: string, status: "PLANNING" | "ACTIVE" | "ON_HOLD" | "CANCELLED") {
  return db.project.update({ where: { id, organizationId }, data: { status } });
}

// --- Members ---

export function addProjectMember(projectId: string, userId: string, role?: string | null) {
  return db.projectMember.upsert({
    where: { projectId_userId: { projectId, userId } },
    update: { role },
    create: { projectId, userId, role },
  });
}

export function removeProjectMember(projectId: string, userId: string) {
  return db.projectMember.delete({ where: { projectId_userId: { projectId, userId } } });
}

// --- Milestones ---

export function listMilestones(organizationId: string) {
  return db.projectMilestone.findMany({
    where: { project: { organizationId } },
    include: { project: true, tasks: true },
    orderBy: { dueDate: "asc" },
  });
}

interface MilestoneInput {
  projectId: string;
  name: string;
  dueDate?: Date | null;
}

export function createMilestone(data: MilestoneInput) {
  return db.projectMilestone.create({ data });
}

export class MilestoneStateError extends Error {}

export async function completeMilestone(organizationId: string, id: string) {
  const milestone = await db.projectMilestone.findFirst({
    where: { id, project: { organizationId } },
    include: { tasks: true },
  });
  if (!milestone) throw new Error("Milestone not found.");
  if (milestone.status === "COMPLETED") throw new MilestoneStateError("This milestone is already completed.");
  const incomplete = milestone.tasks.filter((t) => t.status !== "DONE");
  if (incomplete.length > 0) {
    throw new MilestoneStateError(`${incomplete.length} task(s) under this milestone are not yet done.`);
  }
  return db.projectMilestone.update({ where: { id }, data: { status: "COMPLETED", completedAt: new Date() } });
}

// --- Tasks ---

export function listTasks(organizationId: string) {
  return db.projectTask.findMany({
    where: { organizationId },
    include: { project: true, milestone: true, assignee: true },
    orderBy: { createdAt: "desc" },
  });
}

interface TaskInput {
  projectId: string;
  milestoneId?: string | null;
  title: string;
  description?: string | null;
  priority?: ProjectTaskPriority;
  assigneeId?: string | null;
  dueDate?: Date | null;
  createdById?: string | null;
}

export function createTask(organizationId: string, data: TaskInput) {
  return db.projectTask.create({ data: { organizationId, ...data } });
}

export function updateTaskStatus(organizationId: string, id: string, status: ProjectTaskStatus) {
  return db.projectTask.update({
    where: { id, organizationId },
    data: { status, completedAt: status === "DONE" ? new Date() : null },
  });
}

// --- Reports ---

export async function getProjectsSummary(organizationId: string) {
  const now = new Date();
  const [projects, tasks] = await Promise.all([
    db.project.findMany({ where: { organizationId } }),
    db.projectTask.findMany({ where: { organizationId }, include: { assignee: true } }),
  ]);

  const projectsByStatus = projects.reduce<Record<string, number>>((acc, p) => {
    acc[p.status] = (acc[p.status] ?? 0) + 1;
    return acc;
  }, {});

  const tasksByStatus = tasks.reduce<Record<string, number>>((acc, t) => {
    acc[t.status] = (acc[t.status] ?? 0) + 1;
    return acc;
  }, {});

  const overdueTasks = tasks.filter((t) => t.status !== "DONE" && t.dueDate && t.dueDate < now);

  const workloadMap = new Map<string, { name: string; openTaskCount: number }>();
  for (const task of tasks) {
    if (!task.assignee || task.status === "DONE") continue;
    const key = task.assignee.id;
    const entry = workloadMap.get(key) ?? { name: task.assignee.name ?? task.assignee.email ?? "Unknown", openTaskCount: 0 };
    entry.openTaskCount += 1;
    workloadMap.set(key, entry);
  }
  const workload = Array.from(workloadMap.values()).sort((a, b) => b.openTaskCount - a.openTaskCount);

  return {
    activeProjectCount: projects.filter((p) => p.status === "ACTIVE").length,
    totalProjectCount: projects.length,
    projectsByStatus,
    tasksByStatus,
    totalTaskCount: tasks.length,
    overdueTaskCount: overdueTasks.length,
    workload,
  };
}
