"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import { verifyCurrentPassword } from "@/lib/auth/verify-password";
import { decryptTotpSecret, verifyTotpCode } from "@/lib/auth/totp";
import { db } from "@/lib/db";
import { getHrSettings, initiateTermination, reviewTermination, cancelTermination, reinstateEmployee, setOffboardingTaskCompletion, NotFoundError, HrWorkflowError } from "@/modules/hr/service";
import { logAuditEvent } from "@/lib/audit";

const clean = (value: FormDataEntryValue | null) => String(value ?? "").trim() || null;
async function context(permission: string) { const tenant = await requireModuleAccess("hr"); if (!hasPermission(tenant, permission)) redirect("/app/hr/terminations?error=forbidden"); const session = await getServerAuthSession(); if (!session?.user?.id) redirect("/login"); return { tenant, userId: session.user.id }; }
async function verifyStepUp(userId: string, formData: FormData) {
  const password = clean(formData.get("currentPassword")); if (!password || !(await verifyCurrentPassword(userId, password))) return false;
  const user = await db.user.findUnique({ where: { id: userId }, select: { twoFactorEnabled: true, twoFactorSecret: true } });
  if (!user?.twoFactorEnabled) return true;
  try { return !!user.twoFactorSecret && verifyTotpCode(decryptTotpSecret(user.twoFactorSecret), clean(formData.get("twoFactorCode")) || ""); } catch { return false; }
}
function workflowError(error: unknown): never { if (error instanceof NotFoundError) redirect("/app/hr/terminations?error=not-found"); if (error instanceof HrWorkflowError) redirect("/app/hr/terminations?error=invalid-state"); throw error; }

export async function submitTermination(formData: FormData): Promise<void> {
  const { tenant, userId } = await context(PERMISSIONS.HR_TERMINATIONS_INITIATE); if (!(await verifyStepUp(userId, formData))) redirect("/app/hr/terminations?error=step-up");
  const employeeId = clean(formData.get("employeeId")); const reason = clean(formData.get("reason")); const effectiveDate = clean(formData.get("effectiveDate")); const lastWorkingDate = clean(formData.get("lastWorkingDate"));
  if (!employeeId || !reason || !effectiveDate || !lastWorkingDate) redirect("/app/hr/terminations?error=missing-fields");
  const settings = await getHrSettings(tenant.organizationId);
  try { const request = await initiateTermination(tenant.organizationId, employeeId, userId, { category: (clean(formData.get("category")) || "OTHER") as "OTHER", reason, effectiveDate: new Date(`${effectiveDate}T00:00:00.000Z`), lastWorkingDate: new Date(`${lastWorkingDate}T00:00:00.000Z`), notes: clean(formData.get("notes")), attachmentAssetId: clean(formData.get("attachmentAssetId")), accessDisposition: (clean(formData.get("accessDisposition")) || "SUSPEND_ON_EFFECTIVE_DATE") as "SUSPEND_ON_EFFECTIVE_DATE", makerCheckerEnabled: settings.terminationApprovalRequired, finalSalary: clean(formData.get("finalSalary")), leaveEncashment: clean(formData.get("leaveEncashment")) || "0", severance: clean(formData.get("severance")) || "0", outstandingDeductions: clean(formData.get("outstandingDeductions")) || "0", benefitsSettlement: clean(formData.get("benefitsSettlement")) || "0" }); await logAuditEvent({ organizationId: tenant.organizationId, userId, module: "hr", action: "termination.initiated", entityName: "HrTerminationRequest", entityId: request.id, metadata: { employeeId, effectiveDate, accessDisposition: clean(formData.get("accessDisposition")) } }); } catch (error) { workflowError(error); }
  revalidatePath("/app/hr/terminations"); revalidatePath("/app/hr/employees"); redirect("/app/hr/terminations?saved=1");
}

export async function decideTermination(formData: FormData): Promise<void> { const { tenant, userId } = await context(PERMISSIONS.HR_TERMINATIONS_APPROVE); if (!(await verifyStepUp(userId, formData))) redirect("/app/hr/terminations?error=step-up"); const id = clean(formData.get("id")); if (!id) redirect("/app/hr/terminations?error=missing-fields"); const approved = formData.get("decision") === "approve"; try { await reviewTermination(tenant.organizationId, id, userId, approved, clean(formData.get("reason"))); await logAuditEvent({ organizationId: tenant.organizationId, userId, module: "hr", action: approved ? "termination.approved" : "termination.rejected", entityName: "HrTerminationRequest", entityId: id }); } catch (error) { workflowError(error); } revalidatePath("/app/hr/terminations"); revalidatePath("/app/hr/employees"); redirect("/app/hr/terminations?saved=1"); }

export async function cancelTerminationRequest(formData: FormData): Promise<void> { const { tenant, userId } = await context(PERMISSIONS.HR_TERMINATIONS_APPROVE); if (!(await verifyStepUp(userId, formData))) redirect("/app/hr/terminations?error=step-up"); const id = clean(formData.get("id")); const reason = clean(formData.get("reason")); if (!id || !reason) redirect("/app/hr/terminations?error=missing-fields"); try { await cancelTermination(tenant.organizationId, id, userId, reason); await logAuditEvent({ organizationId: tenant.organizationId, userId, module: "hr", action: "termination.cancelled", entityName: "HrTerminationRequest", entityId: id }); } catch (error) { workflowError(error); } revalidatePath("/app/hr/terminations"); revalidatePath("/app/hr/employees"); redirect("/app/hr/terminations?saved=1"); }

export async function reinstate(formData: FormData): Promise<void> { const { tenant, userId } = await context(PERMISSIONS.HR_EMPLOYEES_REINSTATE); if (!(await verifyStepUp(userId, formData))) redirect("/app/hr/terminations?error=step-up"); const employeeId = clean(formData.get("employeeId")); const reason = clean(formData.get("reason")); const effectiveDate = clean(formData.get("effectiveDate")); if (!employeeId || !reason || !effectiveDate) redirect("/app/hr/terminations?error=missing-fields"); try { await reinstateEmployee(tenant.organizationId, employeeId, userId, { reason, effectiveDate: new Date(`${effectiveDate}T00:00:00.000Z`), jobTitle: clean(formData.get("jobTitle")), department: clean(formData.get("department")), managerId: clean(formData.get("managerId")), payrollEligible: formData.get("payrollEligible") === "on", restoreAccess: formData.get("restoreAccess") === "on" }); await logAuditEvent({ organizationId: tenant.organizationId, userId, module: "hr", action: "employee.reinstated", entityName: "HrEmployee", entityId: employeeId }); } catch (error) { workflowError(error); } revalidatePath("/app/hr/terminations"); revalidatePath("/app/hr/employees"); redirect("/app/hr/terminations?saved=1"); }

export async function toggleOffboardingTask(formData: FormData): Promise<void> { const { tenant, userId } = await context(PERMISSIONS.HR_TERMINATIONS_INITIATE); const taskId = clean(formData.get("taskId")); if (!taskId) redirect("/app/hr/terminations?error=missing-fields"); try { await setOffboardingTaskCompletion(tenant.organizationId, taskId, userId, formData.get("completed") === "true", clean(formData.get("notes"))); await logAuditEvent({ organizationId: tenant.organizationId, userId, module: "hr", action: "offboarding_task.updated", entityName: "HrOffboardingTask", entityId: taskId, metadata: { completed: formData.get("completed") === "true" } }); } catch (error) { workflowError(error); } revalidatePath("/app/hr/terminations"); }
