"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import {
  createRun,
  processRun,
  cancelRun,
  RunStateError,
  NoCompensationError,
  SchoolPayrollInputError,
  NotFoundError,
  getPayrollRunForPostingRetry,
} from "@/modules/payroll/service";
import { postPayrollRunAccounting } from "@/modules/payroll/accounting";
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
  const tenant = await requireModuleAccess("payroll");
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
  const tenant = await requireModuleAccess("payroll");
  if (!hasPermission(tenant, PERMISSIONS.PAYROLL_RUNS_MANAGE)) {
    redirect("/app/payroll/runs?error=forbidden");
  }
  const parsed = parseWithSchema(idSchema, { id: clean(formData.get("id")) });
  if (!parsed.success) return;
  const { id } = parsed.data;
  const session = await getServerAuthSession();
  let postingState: "failed" | "inactive" | null = null;

  try {
    const run = await processRun(tenant.organizationId, id);
    const completedRun = await getPayrollRunForPostingRetry(tenant.organizationId, run.id);
    if (completedRun) {
      try {
        const posting = await postPayrollRunAccounting(tenant.organizationId, completedRun, session?.user?.id);
        if (!posting.posted) postingState = posting.reason === "error" ? "failed" : "inactive";
      } catch (error) {
        postingState = "failed";
        console.error("[payroll:accounting-posting] status update failed", { organizationId: tenant.organizationId, runId: run.id, error });
      }
    } else {
      postingState = "failed";
    }
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
    if (error instanceof SchoolPayrollInputError) {
      await logAuditEvent({
        organizationId: tenant.organizationId,
        userId: session?.user?.id,
        module: "payroll",
        action: "payroll.processed",
        entityName: "PayrollRun",
        entityId: id,
        status: "FAILURE",
      });
      redirect(`/app/payroll/runs?error=school-inputs-${error.reason}`);
    }
    if (error instanceof NotFoundError) redirect("/app/payroll/runs?error=not-found");
    throw error;
  }

  revalidatePath("/app/payroll/runs");
  revalidatePath("/app/payroll/payslips");
  redirect(`/app/payroll/runs?saved=1${postingState ? `&posting=${postingState}` : ""}`);
}

export async function retryPayrollAccountingPosting(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("payroll");
  if (!hasPermission(tenant, PERMISSIONS.PAYROLL_RUNS_MANAGE)) redirect("/app/payroll/runs?error=forbidden");
  const parsed = parseWithSchema(idSchema, { id: clean(formData.get("id")) });
  if (!parsed.success) redirect("/app/payroll/runs?error=invalid-state");
  const session = await getServerAuthSession();
  const run = await getPayrollRunForPostingRetry(tenant.organizationId, parsed.data.id);
  if (!run) redirect("/app/payroll/runs?error=posting-not-retryable");
  let postingState: "failed" | "inactive" | null = null;
  try {
    const result = await postPayrollRunAccounting(tenant.organizationId, run, session?.user?.id);
    if (!result.posted) postingState = result.reason === "error" ? "failed" : "inactive";
  } catch (error) {
    postingState = "failed";
    console.error("[payroll:accounting-retry] failed", { organizationId: tenant.organizationId, runId: run.id, actorId: session?.user?.id, error });
  }
  revalidatePath("/app/payroll/runs");
  redirect(`/app/payroll/runs?posting=${postingState ?? "complete"}`);
}

export async function cancelExistingRun(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("payroll");
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
