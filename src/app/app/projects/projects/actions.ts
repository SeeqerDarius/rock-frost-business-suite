"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import {
  createProject,
  updateProject,
  completeProject,
  setProjectStatus,
  addProjectMember,
  removeProjectMember,
  ProjectStateError,
  NotFoundError,
} from "@/modules/projects/service";
import { cuid, shortText, longText, moneyAmountNonNegative, dateInput, parseWithSchema } from "@/lib/validation";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

const PROJECT_STATUSES = ["PLANNING", "ACTIVE", "ON_HOLD", "CANCELLED"] as const;

const projectSchema = z.object({
  name: shortText,
  description: longText.nullable(),
  startDate: dateInput.nullable(),
  endDate: dateInput.nullable(),
  budget: moneyAmountNonNegative.nullable(),
  ownerId: cuid.nullable(),
});

export async function upsertProject(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("projects");
  if (!hasPermission(tenant, PERMISSIONS.PROJECTS_PROJECTS_MANAGE)) {
    redirect("/app/projects/projects?error=forbidden");
  }

  const id = clean(formData.get("id"));
  const parsed = parseWithSchema(projectSchema, {
    name: clean(formData.get("name")) ?? "",
    description: clean(formData.get("description")),
    startDate: clean(formData.get("startDate")),
    endDate: clean(formData.get("endDate")),
    budget: clean(formData.get("budget")),
    ownerId: clean(formData.get("ownerId")),
  });
  if (!parsed.success) {
    redirect("/app/projects/projects?error=missing-fields");
  }
  const data = parsed.data;

  if (id) {
    await updateProject(tenant.organizationId, id, data);
  } else {
    await createProject(tenant.organizationId, data);
  }

  revalidatePath("/app/projects/projects");
  redirect("/app/projects/projects?saved=1");
}

export async function changeProjectStatus(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("projects");
  if (!hasPermission(tenant, PERMISSIONS.PROJECTS_PROJECTS_MANAGE)) {
    redirect("/app/projects/projects?error=forbidden");
  }

  const id = clean(formData.get("id"));
  const statusResult = z.enum(PROJECT_STATUSES).safeParse(clean(formData.get("status")));
  if (!id || !statusResult.success) return;

  await setProjectStatus(tenant.organizationId, id, statusResult.data);
  revalidatePath("/app/projects/projects");
  redirect("/app/projects/projects?saved=1");
}

export async function completeExistingProject(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("projects");
  if (!hasPermission(tenant, PERMISSIONS.PROJECTS_PROJECTS_MANAGE)) {
    redirect("/app/projects/projects?error=forbidden");
  }

  const id = clean(formData.get("id"));
  if (!id) return;

  try {
    await completeProject(tenant.organizationId, id);
  } catch (error) {
    if (error instanceof ProjectStateError) redirect("/app/projects/projects?error=not-ready");
    throw error;
  }

  revalidatePath("/app/projects/projects");
  redirect("/app/projects/projects?saved=1");
}

export async function addMemberToProject(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("projects");
  if (!hasPermission(tenant, PERMISSIONS.PROJECTS_PROJECTS_MANAGE)) {
    redirect("/app/projects/projects?error=forbidden");
  }

  const parsed = parseWithSchema(
    z.object({ projectId: cuid, userId: cuid, role: shortText.nullable() }),
    {
      projectId: clean(formData.get("projectId")) ?? "",
      userId: clean(formData.get("userId")) ?? "",
      role: clean(formData.get("role")),
    },
  );
  if (!parsed.success) {
    redirect("/app/projects/projects?error=missing-fields");
  }
  const { projectId, userId, role } = parsed.data;

  try {
    await addProjectMember(tenant.organizationId, projectId, userId, role);
  } catch (error) {
    if (error instanceof NotFoundError) redirect("/app/projects/projects?error=not-found");
    throw error;
  }
  revalidatePath("/app/projects/projects");
  redirect("/app/projects/projects?saved=1");
}

export async function removeMemberFromProject(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("projects");
  if (!hasPermission(tenant, PERMISSIONS.PROJECTS_PROJECTS_MANAGE)) {
    redirect("/app/projects/projects?error=forbidden");
  }

  const projectId = clean(formData.get("projectId"));
  const userId = clean(formData.get("userId"));
  if (!projectId || !userId) return;

  try {
    await removeProjectMember(tenant.organizationId, projectId, userId);
  } catch (error) {
    if (error instanceof NotFoundError) redirect("/app/projects/projects?error=not-found");
    throw error;
  }
  revalidatePath("/app/projects/projects");
  redirect("/app/projects/projects?saved=1");
}
