"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import { createRun, processRun, cancelRun, RunStateError, NoCompensationError } from "@/modules/payroll/service";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

export async function createNewRun(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.PAYROLL_RUNS_MANAGE)) {
    redirect("/app/payroll/runs?error=forbidden");
  }

  const periodStartRaw = clean(formData.get("periodStart"));
  const periodEndRaw = clean(formData.get("periodEnd"));
  const payDateRaw = clean(formData.get("payDate"));
  if (!periodStartRaw || !periodEndRaw || !payDateRaw) {
    redirect("/app/payroll/runs?error=missing-fields");
  }

  const session = await getServerAuthSession();
  await createRun(tenant.organizationId, {
    periodStart: new Date(`${periodStartRaw}T00:00:00`),
    periodEnd: new Date(`${periodEndRaw}T00:00:00`),
    payDate: new Date(`${payDateRaw}T00:00:00`),
    createdById: session?.user?.id ?? null,
  });

  revalidatePath("/app/payroll/runs");
  redirect("/app/payroll/runs?saved=1");
}

export async function processExistingRun(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.PAYROLL_RUNS_MANAGE)) {
    redirect("/app/payroll/runs?error=forbidden");
  }
  const id = clean(formData.get("id"));
  if (!id) return;

  try {
    await processRun(tenant.organizationId, id);
  } catch (error) {
    if (error instanceof RunStateError) redirect("/app/payroll/runs?error=invalid-state");
    if (error instanceof NoCompensationError) redirect("/app/payroll/runs?error=no-compensation");
    throw error;
  }

  revalidatePath("/app/payroll/runs");
  revalidatePath("/app/payroll/payslips");
  redirect("/app/payroll/runs?saved=1");
}

export async function cancelExistingRun(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.PAYROLL_RUNS_MANAGE)) {
    redirect("/app/payroll/runs?error=forbidden");
  }
  const id = clean(formData.get("id"));
  if (!id) return;

  try {
    await cancelRun(tenant.organizationId, id);
  } catch (error) {
    if (error instanceof RunStateError) redirect("/app/payroll/runs?error=invalid-state");
    throw error;
  }

  revalidatePath("/app/payroll/runs");
  redirect("/app/payroll/runs?saved=1");
}
