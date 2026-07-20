"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import {
  createProject,
  updateProject,
  completeProject,
  setProjectStatus,
  addProjectMember,
  removeProjectMember,
  ProjectStateError,
} from "@/modules/projects/service";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

export async function upsertProject(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.PROJECTS_PROJECTS_MANAGE)) {
    redirect("/app/projects/projects?error=forbidden");
  }

  const id = clean(formData.get("id"));
  const name = clean(formData.get("name"));
  if (!name) {
    redirect("/app/projects/projects?error=missing-fields");
  }

  const startDateRaw = clean(formData.get("startDate"));
  const endDateRaw = clean(formData.get("endDate"));

  const data = {
    name,
    description: clean(formData.get("description")),
    startDate: startDateRaw ? new Date(`${startDateRaw}T00:00:00`) : null,
    endDate: endDateRaw ? new Date(`${endDateRaw}T00:00:00`) : null,
    budget: clean(formData.get("budget")),
    ownerId: clean(formData.get("ownerId")),
  };

  if (id) {
    await updateProject(tenant.organizationId, id, data);
  } else {
    await createProject(tenant.organizationId, data);
  }

  revalidatePath("/app/projects/projects");
  redirect("/app/projects/projects?saved=1");
}

export async function changeProjectStatus(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.PROJECTS_PROJECTS_MANAGE)) {
    redirect("/app/projects/projects?error=forbidden");
  }

  const id = clean(formData.get("id"));
  const status = clean(formData.get("status")) as "PLANNING" | "ACTIVE" | "ON_HOLD" | "CANCELLED" | null;
  if (!id || !status) return;

  await setProjectStatus(tenant.organizationId, id, status);
  revalidatePath("/app/projects/projects");
  redirect("/app/projects/projects?saved=1");
}

export async function completeExistingProject(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
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
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.PROJECTS_PROJECTS_MANAGE)) {
    redirect("/app/projects/projects?error=forbidden");
  }

  const projectId = clean(formData.get("projectId"));
  const userId = clean(formData.get("userId"));
  if (!projectId || !userId) {
    redirect("/app/projects/projects?error=missing-fields");
  }

  await addProjectMember(projectId, userId, clean(formData.get("role")));
  revalidatePath("/app/projects/projects");
  redirect("/app/projects/projects?saved=1");
}

export async function removeMemberFromProject(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.PROJECTS_PROJECTS_MANAGE)) {
    redirect("/app/projects/projects?error=forbidden");
  }

  const projectId = clean(formData.get("projectId"));
  const userId = clean(formData.get("userId"));
  if (!projectId || !userId) return;

  await removeProjectMember(projectId, userId);
  revalidatePath("/app/projects/projects");
  redirect("/app/projects/projects?saved=1");
}
