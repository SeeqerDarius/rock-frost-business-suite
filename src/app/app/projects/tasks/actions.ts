"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import { createTask, updateTaskStatus, NotFoundError } from "@/modules/projects/service";
import type { ProjectTaskStatus, ProjectTaskPriority } from "@prisma/client";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

export async function createNewTask(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.PROJECTS_TASKS_MANAGE)) {
    redirect("/app/projects/tasks?error=forbidden");
  }

  const projectId = clean(formData.get("projectId"));
  const title = clean(formData.get("title"));
  if (!projectId || !title) {
    redirect("/app/projects/tasks?error=missing-fields");
  }

  const dueDateRaw = clean(formData.get("dueDate"));
  const session = await getServerAuthSession();

  try {
    await createTask(tenant.organizationId, {
      projectId,
      milestoneId: clean(formData.get("milestoneId")),
      title,
      description: clean(formData.get("description")),
      priority: (clean(formData.get("priority")) as ProjectTaskPriority | null) ?? "MEDIUM",
      assigneeId: clean(formData.get("assigneeId")),
      dueDate: dueDateRaw ? new Date(`${dueDateRaw}T00:00:00`) : null,
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
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.PROJECTS_TASKS_MANAGE)) {
    redirect("/app/projects/tasks?error=forbidden");
  }

  const id = clean(formData.get("id"));
  const status = clean(formData.get("status")) as ProjectTaskStatus | null;
  if (!id || !status) return;

  await updateTaskStatus(tenant.organizationId, id, status);
  revalidatePath("/app/projects/tasks");
  redirect("/app/projects/tasks?saved=1");
}
