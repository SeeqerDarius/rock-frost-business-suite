"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import { createLeaveRequest, approveLeaveRequest, rejectLeaveRequest, LeaveDateError, LeaveStateError, NotFoundError } from "@/modules/hr/service";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

export async function createNewLeaveRequest(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.HR_LEAVE_MANAGE)) {
    redirect("/app/hr/leave?error=forbidden");
  }

  const employeeId = clean(formData.get("employeeId"));
  const leaveTypeId = clean(formData.get("leaveTypeId"));
  const startDateRaw = clean(formData.get("startDate"));
  const endDateRaw = clean(formData.get("endDate"));
  if (!employeeId || !leaveTypeId || !startDateRaw || !endDateRaw) {
    redirect("/app/hr/leave?error=missing-fields");
  }

  try {
    await createLeaveRequest(tenant.organizationId, {
      employeeId,
      leaveTypeId,
      startDate: new Date(`${startDateRaw}T00:00:00`),
      endDate: new Date(`${endDateRaw}T00:00:00`),
      reason: clean(formData.get("reason")),
    });
  } catch (error) {
    if (error instanceof LeaveDateError) redirect("/app/hr/leave?error=invalid-dates");
    if (error instanceof NotFoundError) redirect("/app/hr/leave?error=not-found");
    throw error;
  }

  revalidatePath("/app/hr/leave");
  redirect("/app/hr/leave?saved=1");
}

export async function approveExistingLeaveRequest(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.HR_LEAVE_MANAGE)) {
    redirect("/app/hr/leave?error=forbidden");
  }
  const id = clean(formData.get("id"));
  if (!id) return;

  const session = await getServerAuthSession();
  try {
    await approveLeaveRequest(tenant.organizationId, id, session?.user?.id ?? null);
  } catch (error) {
    if (error instanceof LeaveStateError) redirect("/app/hr/leave?error=invalid-state");
    throw error;
  }

  revalidatePath("/app/hr/leave");
  redirect("/app/hr/leave?saved=1");
}

export async function rejectExistingLeaveRequest(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.HR_LEAVE_MANAGE)) {
    redirect("/app/hr/leave?error=forbidden");
  }
  const id = clean(formData.get("id"));
  if (!id) return;

  const session = await getServerAuthSession();
  try {
    await rejectLeaveRequest(tenant.organizationId, id, session?.user?.id ?? null);
  } catch (error) {
    if (error instanceof LeaveStateError) redirect("/app/hr/leave?error=invalid-state");
    throw error;
  }

  revalidatePath("/app/hr/leave");
  redirect("/app/hr/leave?saved=1");
}
