"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { createMilestone, completeMilestone, MilestoneStateError, NotFoundError } from "@/modules/projects/service";
import { cuid, shortText, dateInput, parseWithSchema } from "@/lib/validation";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

const milestoneSchema = z.object({
  projectId: cuid,
  name: shortText,
  dueDate: dateInput.nullable(),
});

export async function createNewMilestone(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.PROJECTS_MILESTONES_MANAGE)) {
    redirect("/app/projects/milestones?error=forbidden");
  }

  const parsed = parseWithSchema(milestoneSchema, {
    projectId: clean(formData.get("projectId")) ?? "",
    name: clean(formData.get("name")) ?? "",
    dueDate: clean(formData.get("dueDate")),
  });
  if (!parsed.success) {
    redirect("/app/projects/milestones?error=missing-fields");
  }

  try {
    await createMilestone(tenant.organizationId, parsed.data);
  } catch (error) {
    if (error instanceof NotFoundError) redirect("/app/projects/milestones?error=not-found");
    throw error;
  }

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
