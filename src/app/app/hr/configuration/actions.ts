"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import {
  createSkillType, deleteSkillType, createSkill, deleteSkill, NotFoundError,
  createEmployeeType, deleteEmployeeType,
  createWorkLocation, deleteWorkLocation,
  createDepartureReason, deleteDepartureReason,
  createWorkingSchedule, deleteWorkingSchedule,
  createTimeType, deleteTimeType,
  createJobPosition, deleteJobPosition,
  createContractTemplate, deleteContractTemplate,
} from "@/modules/hr/service";

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

export async function addEmployeeType(formData: FormData): Promise<void> {
  const tenant = await requireConfigAccess();
  const name = clean(formData.get("name"));
  if (!name) redirect("/app/hr/configuration?error=missing-fields");

  try {
    await createEmployeeType(tenant.organizationId, name);
  } catch {
    redirect("/app/hr/configuration?error=duplicate");
  }
  revalidatePath("/app/hr/configuration");
  redirect("/app/hr/configuration?saved=1");
}

export async function removeEmployeeType(formData: FormData): Promise<void> {
  const tenant = await requireConfigAccess();
  const id = clean(formData.get("id"));
  if (!id) return;

  try {
    await deleteEmployeeType(tenant.organizationId, id);
  } catch (error) {
    if (error instanceof NotFoundError) redirect("/app/hr/configuration?error=not-found");
    throw error;
  }
  revalidatePath("/app/hr/configuration");
  redirect("/app/hr/configuration?saved=1");
}

export async function addWorkLocation(formData: FormData): Promise<void> {
  const tenant = await requireConfigAccess();
  const name = clean(formData.get("name"));
  const locationType = clean(formData.get("locationType"));
  if (!name) redirect("/app/hr/configuration?error=missing-fields");

  try {
    await createWorkLocation(tenant.organizationId, name, (locationType as "OFFICE" | "REMOTE" | "HYBRID") ?? "OFFICE");
  } catch {
    redirect("/app/hr/configuration?error=duplicate");
  }
  revalidatePath("/app/hr/configuration");
  redirect("/app/hr/configuration?saved=1");
}

export async function removeWorkLocation(formData: FormData): Promise<void> {
  const tenant = await requireConfigAccess();
  const id = clean(formData.get("id"));
  if (!id) return;

  try {
    await deleteWorkLocation(tenant.organizationId, id);
  } catch (error) {
    if (error instanceof NotFoundError) redirect("/app/hr/configuration?error=not-found");
    throw error;
  }
  revalidatePath("/app/hr/configuration");
  redirect("/app/hr/configuration?saved=1");
}

export async function addDepartureReason(formData: FormData): Promise<void> {
  const tenant = await requireConfigAccess();
  const name = clean(formData.get("name"));
  if (!name) redirect("/app/hr/configuration?error=missing-fields");

  try {
    await createDepartureReason(tenant.organizationId, name);
  } catch {
    redirect("/app/hr/configuration?error=duplicate");
  }
  revalidatePath("/app/hr/configuration");
  redirect("/app/hr/configuration?saved=1");
}

export async function removeDepartureReason(formData: FormData): Promise<void> {
  const tenant = await requireConfigAccess();
  const id = clean(formData.get("id"));
  if (!id) return;

  try {
    await deleteDepartureReason(tenant.organizationId, id);
  } catch (error) {
    if (error instanceof NotFoundError) redirect("/app/hr/configuration?error=not-found");
    throw error;
  }
  revalidatePath("/app/hr/configuration");
  redirect("/app/hr/configuration?saved=1");
}

export async function addWorkingSchedule(formData: FormData): Promise<void> {
  const tenant = await requireConfigAccess();
  const name = clean(formData.get("name"));
  if (!name) redirect("/app/hr/configuration?error=missing-fields");

  try {
    await createWorkingSchedule(tenant.organizationId, name);
  } catch {
    redirect("/app/hr/configuration?error=duplicate");
  }
  revalidatePath("/app/hr/configuration");
  redirect("/app/hr/configuration?saved=1");
}

export async function removeWorkingSchedule(formData: FormData): Promise<void> {
  const tenant = await requireConfigAccess();
  const id = clean(formData.get("id"));
  if (!id) return;

  try {
    await deleteWorkingSchedule(tenant.organizationId, id);
  } catch (error) {
    if (error instanceof NotFoundError) redirect("/app/hr/configuration?error=not-found");
    throw error;
  }
  revalidatePath("/app/hr/configuration");
  redirect("/app/hr/configuration?saved=1");
}

export async function addTimeType(formData: FormData): Promise<void> {
  const tenant = await requireConfigAccess();
  const name = clean(formData.get("name"));
  if (!name) redirect("/app/hr/configuration?error=missing-fields");

  try {
    await createTimeType(tenant.organizationId, name);
  } catch {
    redirect("/app/hr/configuration?error=duplicate");
  }
  revalidatePath("/app/hr/configuration");
  redirect("/app/hr/configuration?saved=1");
}

export async function removeTimeType(formData: FormData): Promise<void> {
  const tenant = await requireConfigAccess();
  const id = clean(formData.get("id"));
  if (!id) return;

  try {
    await deleteTimeType(tenant.organizationId, id);
  } catch (error) {
    if (error instanceof NotFoundError) redirect("/app/hr/configuration?error=not-found");
    throw error;
  }
  revalidatePath("/app/hr/configuration");
  redirect("/app/hr/configuration?saved=1");
}

export async function addJobPosition(formData: FormData): Promise<void> {
  const tenant = await requireConfigAccess();
  const name = clean(formData.get("name"));
  if (!name) redirect("/app/hr/configuration?error=missing-fields");

  try {
    await createJobPosition(tenant.organizationId, name);
  } catch {
    redirect("/app/hr/configuration?error=duplicate");
  }
  revalidatePath("/app/hr/configuration");
  revalidatePath("/app/hr/employees");
  redirect("/app/hr/configuration?saved=1");
}

export async function removeJobPosition(formData: FormData): Promise<void> {
  const tenant = await requireConfigAccess();
  const id = clean(formData.get("id"));
  if (!id) return;

  try {
    await deleteJobPosition(tenant.organizationId, id);
  } catch (error) {
    if (error instanceof NotFoundError) redirect("/app/hr/configuration?error=not-found");
    throw error;
  }
  revalidatePath("/app/hr/configuration");
  revalidatePath("/app/hr/employees");
  redirect("/app/hr/configuration?saved=1");
}

export async function addContractTemplate(formData: FormData): Promise<void> {
  const tenant = await requireConfigAccess();
  const name = clean(formData.get("name"));
  if (!name) redirect("/app/hr/configuration?error=missing-fields");

  try {
    await createContractTemplate(tenant.organizationId, name);
  } catch {
    redirect("/app/hr/configuration?error=duplicate");
  }
  revalidatePath("/app/hr/configuration");
  redirect("/app/hr/configuration?saved=1");
}

export async function removeContractTemplate(formData: FormData): Promise<void> {
  const tenant = await requireConfigAccess();
  const id = clean(formData.get("id"));
  if (!id) return;

  try {
    await deleteContractTemplate(tenant.organizationId, id);
  } catch (error) {
    if (error instanceof NotFoundError) redirect("/app/hr/configuration?error=not-found");
    throw error;
  }
  revalidatePath("/app/hr/configuration");
  redirect("/app/hr/configuration?saved=1");
}
