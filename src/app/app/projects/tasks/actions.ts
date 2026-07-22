"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import { createTask, updateTaskStatus, NotFoundError } from "@/modules/projects/service";
import { cuid, shortText, longText, dateInput, parseWithSchema } from "@/lib/validation";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

const TASK_STATUSES = ["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"] as const;
const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

const taskSchema = z.object({
  projectId: cuid,
  milestoneId: cuid.nullable(),
  title: shortText,
  description: longText.nullable(),
  priority: z.enum(TASK_PRIORITIES),
  assigneeId: cuid.nullable(),
  dueDate: dateInput.nullable(),
});

export async function createNewTask(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("projects");
  if (!hasPermission(tenant, PERMISSIONS.PROJECTS_TASKS_MANAGE)) {
    redirect("/app/projects/tasks?error=forbidden");
  }

  const parsed = parseWithSchema(taskSchema, {
    projectId: clean(formData.get("projectId")) ?? "",
    milestoneId: clean(formData.get("milestoneId")),
    title: clean(formData.get("title")) ?? "",
    description: clean(formData.get("description")),
    priority: clean(formData.get("priority")) ?? "MEDIUM",
    assigneeId: clean(formData.get("assigneeId")),
    dueDate: clean(formData.get("dueDate")),
  });
  if (!parsed.success) {
    redirect("/app/projects/tasks?error=missing-fields");
  }
  const { projectId, milestoneId, title, description, priority, assigneeId, dueDate } = parsed.data;

  const session = await getServerAuthSession();

  try {
    await createTask(tenant.organizationId, {
      projectId,
      milestoneId,
      title,
      description,
      priority,
      assigneeId,
      dueDate,
      createdById: session?.user?.id ?? null,
    });
  } catch (error) {
    if (error instanceof NotFoundError) redirect("/app/projects/tasks?error=not-found");
    throw error;
  }

  revalidatePath("/app/projects/tasks");
  redirect("/app/projects/tasks?saved=1");
}

export async function changeTaskStatus(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("projects");
  if (!hasPermission(tenant, PERMISSIONS.PROJECTS_TASKS_MANAGE)) {
    redirect("/app/projects/tasks?error=forbidden");
  }

  const id = clean(formData.get("id"));
  const statusResult = z.enum(TASK_STATUSES).safeParse(clean(formData.get("status")));
  if (!id || !statusResult.success) return;

  await updateTaskStatus(tenant.organizationId, id, statusResult.data);
  revalidatePath("/app/projects/tasks");
  redirect("/app/projects/tasks?saved=1");
}
