"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { createMilestone, completeMilestone, MilestoneStateError } from "@/modules/projects/service";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

export async function createNewMilestone(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.PROJECTS_MILESTONES_MANAGE)) {
    redirect("/app/projects/milestones?error=forbidden");
  }

  const projectId = clean(formData.get("projectId"));
  const name = clean(formData.get("name"));
  if (!projectId || !name) {
    redirect("/app/projects/milestones?error=missing-fields");
  }

  const dueDateRaw = clean(formData.get("dueDate"));
  await createMilestone({ projectId, name, dueDate: dueDateRaw ? new Date(`${dueDateRaw}T00:00:00`) : null });

  revalidatePath("/app/projects/milestones");
  redirect("/app/projects/milestones?saved=1");
}

export async function completeExistingMilestone(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.PROJECTS_MILESTONES_MANAGE)) {
    redirect("/app/projects/milestones?error=forbidden");
  }

  const id = clean(formData.get("id"));
  if (!id) return;

  try {
    await completeMilestone(tenant.organizationId, id);
  } catch (error) {
    if (error instanceof MilestoneStateError) redirect("/app/projects/milestones?error=not-ready");
    throw error;
  }

  revalidatePath("/app/projects/milestones");
  redirect("/app/projects/milestones?saved=1");
}
