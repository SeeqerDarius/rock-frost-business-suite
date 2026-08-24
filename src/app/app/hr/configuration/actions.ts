"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { createSkillType, deleteSkillType, createSkill, deleteSkill, NotFoundError } from "@/modules/hr/service";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

async function requireConfigAccess() {
  const tenant = await requireModuleAccess("hr");
  if (!hasPermission(tenant, PERMISSIONS.HR_SETTINGS_MANAGE)) {
    redirect("/app/hr/configuration?error=forbidden");
  }
  return tenant;
}

export async function addSkillType(formData: FormData): Promise<void> {
  const tenant = await requireConfigAccess();
  const name = clean(formData.get("name"));
  if (!name) redirect("/app/hr/configuration?error=missing-fields");

  try {
    await createSkillType(tenant.organizationId, name);
  } catch {
    redirect("/app/hr/configuration?error=duplicate");
  }
  revalidatePath("/app/hr/configuration");
  redirect("/app/hr/configuration?saved=1");
}

export async function removeSkillType(formData: FormData): Promise<void> {
  const tenant = await requireConfigAccess();
  const id = clean(formData.get("id"));
  if (!id) return;

  try {
    await deleteSkillType(tenant.organizationId, id);
  } catch (error) {
    if (error instanceof NotFoundError) redirect("/app/hr/configuration?error=not-found");
    throw error;
  }
  revalidatePath("/app/hr/configuration");
  redirect("/app/hr/configuration?saved=1");
}

export async function addSkill(formData: FormData): Promise<void> {
  const tenant = await requireConfigAccess();
  const skillTypeId = clean(formData.get("skillTypeId"));
  const name = clean(formData.get("name"));
  if (!skillTypeId || !name) redirect("/app/hr/configuration?error=missing-fields");

  try {
    await createSkill(tenant.organizationId, skillTypeId, name);
  } catch (error) {
    if (error instanceof NotFoundError) redirect("/app/hr/configuration?error=not-found");
    redirect("/app/hr/configuration?error=duplicate");
  }
  revalidatePath("/app/hr/configuration");
  redirect("/app/hr/configuration?saved=1");
}

export async function removeSkill(formData: FormData): Promise<void> {
  const tenant = await requireConfigAccess();
  const id = clean(formData.get("id"));
  if (!id) return;

  try {
    await deleteSkill(tenant.organizationId, id);
  } catch (error) {
    if (error instanceof NotFoundError) redirect("/app/hr/configuration?error=not-found");
    throw error;
  }
  revalidatePath("/app/hr/configuration");
  redirect("/app/hr/configuration?saved=1");
}
