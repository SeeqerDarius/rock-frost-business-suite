"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import {
  createRun,
  processRun,
  cancelRun,
  RunStateError,
  NoCompensationError,
  NotFoundError,
} from "@/modules/payroll/service";
import { cuid, dateInput, parseWithSchema } from "@/lib/validation";
import { logAuditEvent } from "@/lib/audit";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

const createRunSchema = z.object({
  periodStart: dateInput,
  periodEnd: dateInput,
  payDate: dateInput,
});

export async function createNewRun(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.PAYROLL_RUNS_MANAGE)) {
    redirect("/app/payroll/runs?error=forbidden");
  }

  const parsed = parseWithSchema(createRunSchema, {
    periodStart: clean(formData.get("periodStart")),
    periodEnd: clean(formData.get("periodEnd")),
    payDate: clean(formData.get("payDate")),
  });
  if (!parsed.success) {
    redirect("/app/payroll/runs?error=missing-fields");
  }
  const { periodStart, periodEnd, payDate } = parsed.data;

  const session = await getServerAuthSession();
  await createRun(tenant.organizationId, {
    periodStart,
    periodEnd,
    payDate,
    createdById: session?.user?.id ?? null,
  });

  revalidatePath("/app/payroll/runs");
  redirect("/app/payroll/runs?saved=1");
}

const idSchema = z.object({ id: cuid });

export async function processExistingRun(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.PAYROLL_RUNS_MANAGE)) {
    redirect("/app/payroll/runs?error=forbidden");
  }
  const parsed = parseWithSchema(idSchema, { id: clean(formData.get("id")) });
  if (!parsed.success) return;
  const { id } = parsed.data;
  const session = await getServerAuthSession();

  try {
    const run = await processRun(tenant.organizationId, id);
    await logAuditEvent({
      organizationId: tenant.organizationId,
      userId: session?.user?.id,
      module: "payroll",
      action: "payroll.processed",
      entityName: "PayrollRun",
      entityId: run.id,
    });
  } catch (error) {
    if (error instanceof RunStateError) {
      await logAuditEvent({
        organizationId: tenant.organizationId,
        userId: session?.user?.id,
        module: "payroll",
        action: "payroll.processed",
        entityName: "PayrollRun",
        entityId: id,
        status: "FAILURE",
      });
      redirect("/app/payroll/runs?error=invalid-state");
    }
    if (error instanceof NoCompensationError) {
      await logAuditEvent({
        organizationId: tenant.organizationId,
        userId: session?.user?.id,
        module: "payroll",
        action: "payroll.processed",
        entityName: "PayrollRun",
        entityId: id,
        status: "FAILURE",
      });
      redirect("/app/payroll/runs?error=no-compensation");
    }
    if (error instanceof NotFoundError) redirect("/app/payroll/runs?error=not-found");
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
  const parsed = parseWithSchema(idSchema, { id: clean(formData.get("id")) });
  if (!parsed.success) return;
  const { id } = parsed.data;
  const session = await getServerAuthSession();

  try {
    await cancelRun(tenant.organizationId, id);
  } catch (error) {
    if (error instanceof RunStateError) redirect("/app/payroll/runs?error=invalid-state");
    if (error instanceof NotFoundError) redirect("/app/payroll/runs?error=not-found");
    throw error;
  }

  await logAuditEvent({
    organizationId: tenant.organizationId,
    userId: session?.user?.id,
    module: "payroll",
    action: "payroll.cancelled",
    entityName: "PayrollRun",
    entityId: id,
  });

  revalidatePath("/app/payroll/runs");
  redirect("/app/payroll/runs?saved=1");
}
