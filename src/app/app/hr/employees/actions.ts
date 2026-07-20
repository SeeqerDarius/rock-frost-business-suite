"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { createEmployee, updateEmployee, activateEmployee, setEmployeeStatus, EmployeeStateError } from "@/modules/hr/service";
import type { HrEmployeeStatus } from "@prisma/client";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

export async function upsertEmployee(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.HR_EMPLOYEES_MANAGE)) {
    redirect("/app/hr/employees?error=forbidden");
  }

  const id = clean(formData.get("id"));
  const fullName = clean(formData.get("fullName"));
  const hireDateRaw = clean(formData.get("hireDate"));
  if (!fullName || !hireDateRaw) {
    redirect("/app/hr/employees?error=missing-fields");
  }

  const data = {
    fullName,
    email: clean(formData.get("email")),
    phone: clean(formData.get("phone")),
    jobTitle: clean(formData.get("jobTitle")),
    department: clean(formData.get("department")),
    hireDate: new Date(`${hireDateRaw}T00:00:00`),
    managerId: clean(formData.get("managerId")),
    notes: clean(formData.get("notes")),
  };

  if (id) {
    await updateEmployee(tenant.organizationId, id, data);
  } else {
    await createEmployee(tenant.organizationId, data);
  }

  revalidatePath("/app/hr/employees");
  redirect("/app/hr/employees?saved=1");
}

export async function activateExistingEmployee(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.HR_EMPLOYEES_MANAGE)) {
    redirect("/app/hr/employees?error=forbidden");
  }
  const id = clean(formData.get("id"));
  if (!id) return;

  try {
    await activateEmployee(tenant.organizationId, id);
  } catch (error) {
    if (error instanceof EmployeeStateError) redirect("/app/hr/employees?error=invalid-state");
    throw error;
  }

  revalidatePath("/app/hr/employees");
  redirect("/app/hr/employees?saved=1");
}

export async function changeEmployeeStatus(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.HR_EMPLOYEES_MANAGE)) {
    redirect("/app/hr/employees?error=forbidden");
  }
  const id = clean(formData.get("id"));
  const status = clean(formData.get("status")) as HrEmployeeStatus | null;
  if (!id || !status) return;

  await setEmployeeStatus(tenant.organizationId, id, status);
  revalidatePath("/app/hr/employees");
  redirect("/app/hr/employees?saved=1");
}
