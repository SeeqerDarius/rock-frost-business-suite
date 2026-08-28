"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logAuditEvent } from "@/lib/audit";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import { cuid, dateInput, parseWithSchema, shortText } from "@/lib/validation";
import {
  approveAccountingPlan,
  archiveAccountingPlan,
  createAccountingPlan,
  createAccountingPlanRevision,
  deleteAccountingPlanLine,
  lockAccountingPlan,
  rejectAccountingPlan,
  submitAccountingPlan,
  upsertAccountingPlanLine,
} from "@/modules/accounting/planning-service";

const optionalText = z.string().trim().max(1000).optional();
const createSchema = z.object({
  name: shortText,
  kind: z.enum(["BUDGET", "FORECAST"]),
  startDate: dateInput,
  endDate: dateInput,
  actualThroughDate: z.union([dateInput, z.literal("")]).optional(),
  notes: optionalText,
});
const lineSchema = z.object({
  planId: cuid,
  accountId: cuid,
  periodStart: z.string().trim().regex(/^\d{4}-\d{2}$/).transform((month) => new Date(`${month}-01T00:00:00`)),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  branchId: z.union([cuid, z.literal("")]).optional(),
  sourceModule: z.string().trim().max(50).optional(),
  notes: optionalText,
});
const idSchema = z.object({ planId: cuid });
const lineIdSchema = z.object({ planId: cuid, lineId: cuid });
const rejectSchema = z.object({ planId: cuid, reason: z.string().trim().min(3).max(1000) });

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

async function requirePlanning(permission: string) {
  const tenant = await requireModuleAccess("accounting");
  if (!hasPermission(tenant, permission)) redirect("/app/accounting/planning?error=forbidden");
  const session = await getServerAuthSession();
  if (!session?.user?.id) redirect("/login");
  return { tenant, actorId: session.user.id };
}

async function audit(organizationId: string, actorId: string, action: string, planId: string) {
  await logAuditEvent({ organizationId, userId: actorId, module: "accounting", action, entityName: "AccountingPlan", entityId: planId });
}

export async function createPlanAction(formData: FormData): Promise<void> {
  const { tenant, actorId } = await requirePlanning(PERMISSIONS.ACCOUNTING_PLANS_MANAGE);
  const parsed = parseWithSchema(createSchema, {
    name: value(formData, "name"), kind: value(formData, "kind"), startDate: value(formData, "startDate"), endDate: value(formData, "endDate"), actualThroughDate: value(formData, "actualThroughDate"), notes: value(formData, "notes"),
  });
  if (!parsed.success) redirect("/app/accounting/planning?error=invalid");
  let planId: string;
  try {
    const plan = await createAccountingPlan(tenant.organizationId, { ...parsed.data, actualThroughDate: parsed.data.actualThroughDate || null }, actorId);
    planId = plan.id;
    await audit(tenant.organizationId, actorId, "plan.created", plan.id);
  } catch {
    redirect("/app/accounting/planning?error=invalid");
  }
  redirect(`/app/accounting/planning/${planId}?saved=1`);
}

export async function upsertPlanLineAction(formData: FormData): Promise<void> {
  const { tenant, actorId } = await requirePlanning(PERMISSIONS.ACCOUNTING_PLANS_MANAGE);
  const parsed = parseWithSchema(lineSchema, { planId: value(formData, "planId"), accountId: value(formData, "accountId"), periodStart: value(formData, "periodStart"), amount: value(formData, "amount"), branchId: value(formData, "branchId"), sourceModule: value(formData, "sourceModule"), notes: value(formData, "notes") });
  if (!parsed.success) redirect("/app/accounting/planning?error=invalid");
  try {
    await upsertAccountingPlanLine(tenant.organizationId, parsed.data.planId, { ...parsed.data, branchId: parsed.data.branchId || null, sourceModule: parsed.data.sourceModule || null });
    await audit(tenant.organizationId, actorId, "plan.line_upserted", parsed.data.planId);
  } catch {
    redirect(`/app/accounting/planning/${parsed.data.planId}?error=invalid`);
  }
  revalidatePath(`/app/accounting/planning/${parsed.data.planId}`);
  redirect(`/app/accounting/planning/${parsed.data.planId}?saved=1`);
}

export async function deletePlanLineAction(formData: FormData): Promise<void> {
  const { tenant, actorId } = await requirePlanning(PERMISSIONS.ACCOUNTING_PLANS_MANAGE);
  const parsed = parseWithSchema(lineIdSchema, { planId: value(formData, "planId"), lineId: value(formData, "lineId") });
  if (!parsed.success) redirect("/app/accounting/planning?error=invalid");
  try {
    await deleteAccountingPlanLine(tenant.organizationId, parsed.data.planId, parsed.data.lineId);
    await audit(tenant.organizationId, actorId, "plan.line_deleted", parsed.data.planId);
  } catch { redirect(`/app/accounting/planning/${parsed.data.planId}?error=state`); }
  revalidatePath(`/app/accounting/planning/${parsed.data.planId}`);
  redirect(`/app/accounting/planning/${parsed.data.planId}?saved=1`);
}

async function runTransition(formData: FormData, action: "submit" | "approve" | "reject" | "lock" | "archive" | "revise") {
  const permission = action === "approve" || action === "reject" || action === "lock" ? PERMISSIONS.ACCOUNTING_PLANS_APPROVE : PERMISSIONS.ACCOUNTING_PLANS_MANAGE;
  const { tenant, actorId } = await requirePlanning(permission);
  const parsed = action === "reject" ? parseWithSchema(rejectSchema, { planId: value(formData, "planId"), reason: value(formData, "reason") }) : parseWithSchema(idSchema, { planId: value(formData, "planId") });
  if (!parsed.success) redirect("/app/accounting/planning?error=invalid");
  let destinationPlanId = parsed.data.planId;
  try {
    if (action === "submit") await submitAccountingPlan(tenant.organizationId, parsed.data.planId, actorId);
    if (action === "approve") await approveAccountingPlan(tenant.organizationId, parsed.data.planId, actorId);
    if (action === "reject") await rejectAccountingPlan(tenant.organizationId, parsed.data.planId, actorId, parsed.data.reason);
    if (action === "lock") await lockAccountingPlan(tenant.organizationId, parsed.data.planId, actorId);
    if (action === "archive") await archiveAccountingPlan(tenant.organizationId, parsed.data.planId, actorId);
    if (action === "revise") {
      const revision = await createAccountingPlanRevision(tenant.organizationId, parsed.data.planId, actorId);
      await audit(tenant.organizationId, actorId, "plan.revision_created", revision.id);
      destinationPlanId = revision.id;
    } else {
      const auditAction = { submit: "submitted", approve: "approved", reject: "rejected", lock: "locked", archive: "archived" }[action];
      await audit(tenant.organizationId, actorId, `plan.${auditAction}`, parsed.data.planId);
    }
  } catch { redirect(`/app/accounting/planning/${parsed.data.planId}?error=state`); }
  revalidatePath(`/app/accounting/planning/${parsed.data.planId}`);
  redirect(`/app/accounting/planning/${destinationPlanId}?saved=1`);
}

export const submitPlanAction = (data: FormData) => runTransition(data, "submit");
export const approvePlanAction = (data: FormData) => runTransition(data, "approve");
export const rejectPlanAction = (data: FormData) => runTransition(data, "reject");
export const lockPlanAction = (data: FormData) => runTransition(data, "lock");
export const archivePlanAction = (data: FormData) => runTransition(data, "archive");
export const revisePlanAction = (data: FormData) => runTransition(data, "revise");
