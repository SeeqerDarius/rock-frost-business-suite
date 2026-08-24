import "server-only";

import { db } from "@/lib/db";
import type { HrEmployeeStatus, HrPlanKind, HrPlanActivityType, HrPlanOwnerRule } from "@prisma/client";
import { createWithUniqueRetry } from "@/lib/unique-retry";
import { logAuditEvent } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/auth/permissions";
import {
  getOrganizationModuleConfiguration,
  updateOrganizationModuleConfigurationValues,
} from "@/platform/module-requests/configuration";

export class NotFoundError extends Error {}
type TxClient = Parameters<Parameters<typeof db.$transaction>[0]>[0];

async function requireEmployee(organizationId: string, employeeId: string) {
  const employee = await db.hrEmployee.findFirst({ where: { id: employeeId, organizationId } });
  if (!employee) throw new NotFoundError("Employee not found.");
}

const DEFAULT_EMPLOYEE_NUMBER_PREFIX = "EMP";
const PREFIX_PATTERN = /^[A-Z0-9]{2,8}$/;
const EXTERNAL_STAKEHOLDER_ROLES = new Set(["Vehicle Owner", "Investor"]);

export function isHrEmployeeRole(roleName: string | null | undefined) {
  return Boolean(roleName && roleName !== "Super Admin" && !EXTERNAL_STAKEHOLDER_ROLES.has(roleName));
}

async function enabledHrPrefix(tx: TxClient, organizationId: string) {
  const assignment = await tx.organizationModule.findFirst({
    where: { organizationId, enabled: true, module: { code: "hr" } },
    select: { configuration: true },
  });
  if (!assignment) return null;
  const configuration = assignment.configuration && typeof assignment.configuration === "object" && !Array.isArray(assignment.configuration)
    ? assignment.configuration as Record<string, unknown>
    : {};
  const workflow = configuration.workflow && typeof configuration.workflow === "object" && !Array.isArray(configuration.workflow)
    ? configuration.workflow as Record<string, unknown>
    : {};
  const configured = typeof workflow.employeeNumberPrefix === "string" ? workflow.employeeNumberPrefix : null;
  return configured && PREFIX_PATTERN.test(configured) ? configured : DEFAULT_EMPLOYEE_NUMBER_PREFIX;
}

export async function ensureHrEmployeeForUser(
  tx: TxClient,
  organizationId: string,
  userId: string,
  roleName: string | null | undefined,
  options: { branchId?: string | null; joinedAt?: Date | null; actorId?: string | null; membershipId?: string | null } = {},
) {
  if (!isHrEmployeeRole(roleName)) return null;
  const employeeRole = roleName as string;
  const prefix = await enabledHrPrefix(tx, organizationId);
  if (!prefix) return null;

  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`hr-member-sync:${organizationId}`}))`;
  const existing = await tx.hrEmployee.findFirst({ where: { organizationId, userId }, orderBy: { createdAt: "asc" } });
  if (existing) return existing;

  const user = await tx.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
  if (!user) return null;
  const existingNumbers = await tx.hrEmployee.findMany({
    where: { organizationId, employeeNumber: { startsWith: `${prefix}-` } },
    select: { employeeNumber: true },
  });
  const usedNumbers = new Set(existingNumbers.map(({ employeeNumber }) => employeeNumber));
  let sequence = existingNumbers.length + 1;
  while (usedNumbers.has(`${prefix}-${String(sequence).padStart(4, "0")}`)) sequence += 1;
  const employee = await tx.hrEmployee.create({
    data: {
      organizationId,
      branchId: options.branchId ?? null,
      userId,
      employeeNumber: `${prefix}-${String(sequence).padStart(4, "0")}`,
      fullName: user.name || user.email,
      email: user.email,
      jobTitle: employeeRole,
      hireDate: options.joinedAt ?? new Date(),
      status: "ACTIVE",
    },
  });
  await tx.hrEmployeeStatusHistory.create({
    data: {
      organizationId,
      employeeId: employee.id,
      previousStatus: "ONBOARDING",
      newStatus: "ACTIVE",
      effectiveDate: options.joinedAt ?? new Date(),
      reason: "Created automatically from an active organization membership.",
      initiatedById: options.actorId ?? null,
      approvedById: options.actorId ?? null,
      metadata: { source: "organization-membership", roleName: employeeRole, membershipId: options.membershipId ?? null },
    },
  });
  await logAuditEvent({
    organizationId,
    userId: options.actorId ?? null,
    membershipId: options.membershipId ?? null,
    module: "hr",
    action: "employee.provisioned_from_membership",
    entityName: "HrEmployee",
    entityId: employee.id,
    metadata: { linkedUserId: userId, roleName: employeeRole },
  }, tx);
  return employee;
}

export async function syncActiveOrganizationMembersToHr(tx: TxClient, organizationId: string, actorId?: string | null) {
  const members = await tx.organizationMember.findMany({
    where: { organizationId, status: "ACTIVE" },
    include: { role: true },
    orderBy: { createdAt: "asc" },
  });
  for (const member of members) {
    await ensureHrEmployeeForUser(tx, organizationId, member.userId, member.role?.name, {
      branchId: member.branchId,
      joinedAt: member.joinedAt,
      actorId,
      membershipId: member.id,
    });
  }
}

/** HR has no dedicated settings table; the employee numbering prefix lives
 * in the generic `OrganizationModule.configuration` store. */
export async function getHrSettings(organizationId: string) {
  const configuration = await getOrganizationModuleConfiguration(organizationId, "hr");
  const configured = configuration.workflow.employeeNumberPrefix;
  return {
    employeeNumberPrefix: configured && PREFIX_PATTERN.test(configured) ? configured : DEFAULT_EMPLOYEE_NUMBER_PREFIX,
    terminationApprovalRequired: configuration.workflow.terminationApprovalRequired !== "false",
  };
}

export async function updateHrSettings(organizationId: string, data: { employeeNumberPrefix: string; terminationApprovalRequired?: boolean }, actorId?: string | null) {
  await updateOrganizationModuleConfigurationValues(organizationId, "hr", { workflow: { employeeNumberPrefix: data.employeeNumberPrefix, terminationApprovalRequired: String(data.terminationApprovalRequired ?? true) } }, actorId);
}

/**
 * Fresh module (no reference implementation to migrate from). Every function
 * takes organizationId explicitly and filters on it, per docs/MODULE_BOUNDARIES.md.
 */

// --- Employees ---

export async function listEmployees(organizationId: string) {
  await db.$transaction((tx) => syncActiveOrganizationMembersToHr(tx, organizationId));
  return db.hrEmployee.findMany({
    where: { organizationId },
    include: { manager: true, user: true },
    orderBy: { fullName: "asc" },
  });
}

export function listManagerCandidates(organizationId: string) {
  return db.hrEmployee.findMany({
    where: { organizationId, status: { in: ["ACTIVE", "ON_LEAVE"] } },
    orderBy: { fullName: "asc" },
  });
}

export function getEmployeeProfile(organizationId: string, id: string) {
  return db.hrEmployee.findFirst({
    where: { id, organizationId },
    include: {
      branch: true,
      manager: true,
      reports: { orderBy: { fullName: "asc" } },
      user: true,
      payrollCompensation: true,
      payslips: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });
}

/** The employee's own ancestor chain plus every descendant beneath its top-most
 * ancestor, for the "full chart" recursive tree view. Bounded to this organization's
 * employees only; a manager cycle (never possible through normal edits, since
 * updateEmployee only ever points managerId at an existing employee, but not something
 * this query should trust blindly) is guarded by a visited-set rather than assumed away. */
export async function getOrgChartTree(organizationId: string, employeeId: string) {
  const all = await db.hrEmployee.findMany({ where: { organizationId }, select: { id: true, fullName: true, jobTitle: true, managerId: true, photoData: true, status: true } });
  const byId = new Map(all.map((employee) => [employee.id, employee]));
  const start = byId.get(employeeId);
  if (!start) return null;

  let root = start;
  const seen = new Set([root.id]);
  while (root.managerId && byId.has(root.managerId) && !seen.has(root.managerId)) {
    root = byId.get(root.managerId)!;
    seen.add(root.id);
  }

  const childrenByManager = new Map<string, typeof all>();
  for (const employee of all) {
    if (!employee.managerId) continue;
    const siblings = childrenByManager.get(employee.managerId) ?? [];
    siblings.push(employee);
    childrenByManager.set(employee.managerId, siblings);
  }

  type TreeNode = (typeof all)[number] & { children: TreeNode[] };
  function build(node: (typeof all)[number], visited: Set<string>): TreeNode {
    const children = (childrenByManager.get(node.id) ?? []).filter((child) => !visited.has(child.id));
    return { ...node, children: children.map((child) => build(child, new Set([...visited, child.id]))) };
  }
  return build(root, new Set([root.id]));
}

export function getEmployeePhoto(organizationId: string, id: string) {
  return db.hrEmployee.findFirst({ where: { id, organizationId }, select: { photoData: true, updatedAt: true } });
}

async function generateEmployeeNumber(organizationId: string) {
  const [{ employeeNumberPrefix }, count] = await Promise.all([
    getHrSettings(organizationId),
    db.hrEmployee.count({ where: { organizationId } }),
  ]);
  return `${employeeNumberPrefix}-${String(count + 1).padStart(4, "0")}`;
}

interface EmployeeInput {
  fullName: string;
  email?: string | null;
  phone?: string | null;
  mobilePhone?: string | null;
  tags?: string[];
  photoData?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  hireDate: Date;
  managerId?: string | null;
  notes?: string | null;
}

export async function createEmployee(organizationId: string, data: EmployeeInput) {
  if (data.managerId) await requireEmployee(organizationId, data.managerId);
  return createWithUniqueRetry(async () => {
    const employeeNumber = await generateEmployeeNumber(organizationId);
    return db.hrEmployee.create({ data: { organizationId, employeeNumber, ...data } });
  });
}

export async function updateEmployee(organizationId: string, id: string, data: EmployeeInput) {
  if (data.managerId) await requireEmployee(organizationId, data.managerId);
  return db.hrEmployee.update({ where: { id, organizationId }, data });
}

export class EmployeeStateError extends Error {}

export async function activateEmployee(organizationId: string, id: string) {
  const employee = await db.hrEmployee.findFirst({ where: { id, organizationId } });
  if (!employee) throw new Error("Employee not found.");
  if (employee.status !== "ONBOARDING") throw new EmployeeStateError("Only employees in onboarding can be activated.");
  return db.hrEmployee.update({ where: { id }, data: { status: "ACTIVE" } });
}

export function setEmployeeStatus(organizationId: string, id: string, status: HrEmployeeStatus) {
  return db.hrEmployee.update({
    where: { id, organizationId },
    data: { status, terminationDate: status === "TERMINATED" ? new Date() : undefined },
  });
}

const OFFBOARDING_TASKS = [
  "Suspend or retain system access as approved", "Recover company assets", "Transfer active projects and approvals",
  "Resolve leave balance", "Calculate final salary", "Resolve loans and deductions", "Process benefits and statutory obligations",
  "Issue termination or service documents", "Remove physical and digital access", "Confirm data-retention requirements",
];

export class HrWorkflowError extends Error {}

export function listTerminationRequests(organizationId: string) {
  return db.hrTerminationRequest.findMany({ where: { organizationId }, include: { employee: true }, orderBy: { createdAt: "desc" } });
}

export function getEmployeeStatusHistory(organizationId: string, employeeId: string) {
  return db.hrEmployeeStatusHistory.findMany({ where: { organizationId, employeeId }, orderBy: { effectiveDate: "desc" } });
}

export function listOffboardingTasks(organizationId: string, terminationId: string) {
  return db.hrOffboardingTask.findMany({ where: { organizationId, terminationId }, orderBy: { createdAt: "asc" } });
}

export async function initiateTermination(organizationId: string, employeeId: string, actorId: string, data: {
  category: "RESIGNATION" | "DISMISSAL" | "REDUNDANCY" | "RETIREMENT" | "CONTRACT_COMPLETION" | "DEATH" | "OTHER";
  reason: string; effectiveDate: Date; lastWorkingDate: Date; notes?: string | null; attachmentAssetId?: string | null;
  accessDisposition: "SUSPEND_IMMEDIATELY" | "SUSPEND_ON_EFFECTIVE_DATE" | "LEAVE_UNCHANGED";
  makerCheckerEnabled: boolean; finalSalary?: string | null; leaveEncashment?: string; severance?: string; outstandingDeductions?: string; benefitsSettlement?: string;
}) {
  if (data.lastWorkingDate > data.effectiveDate) throw new HrWorkflowError("Last working date cannot be after the effective date.");
  return db.$transaction(async (tx) => {
    const employee = await tx.hrEmployee.findFirst({ where: { id: employeeId, organizationId } });
    if (!employee || ["TERMINATED", "TERMINATION_PENDING"].includes(employee.status)) throw new HrWorkflowError("Employee cannot enter termination workflow.");
    const request = await tx.hrTerminationRequest.create({ data: { organizationId, employeeId, initiatedById: actorId, ...data, finalSalary: data.finalSalary || null, leaveEncashment: data.leaveEncashment || "0", severance: data.severance || "0", outstandingDeductions: data.outstandingDeductions || "0", benefitsSettlement: data.benefitsSettlement || "0", status: data.makerCheckerEnabled ? "PENDING" : "APPROVED", approvedById: data.makerCheckerEnabled ? null : actorId, reviewedAt: data.makerCheckerEnabled ? null : new Date() } });
    await tx.hrEmployee.update({ where: { id: employee.id }, data: { status: "TERMINATION_PENDING" } });
    await tx.hrEmployeeStatusHistory.create({ data: { organizationId, employeeId, previousStatus: employee.status, newStatus: "TERMINATION_PENDING", effectiveDate: new Date(), reason: data.reason, initiatedById: actorId, approvedById: data.makerCheckerEnabled ? null : actorId, terminationId: request.id } });
    if (data.accessDisposition === "SUSPEND_IMMEDIATELY" && employee.userId) await tx.organizationMember.updateMany({ where: { organizationId, userId: employee.userId, status: "ACTIVE" }, data: { status: "SUSPENDED" } });
    await tx.hrOffboardingTask.createMany({ data: OFFBOARDING_TASKS.map((title) => ({ organizationId, employeeId, terminationId: request.id, title })) });
    if (!data.makerCheckerEnabled && data.effectiveDate <= new Date()) await applyApprovedTermination(tx, request, actorId);
    return request;
  });
}

export async function reviewTermination(organizationId: string, id: string, reviewerId: string, approved: boolean, reason?: string | null) {
  return db.$transaction(async (tx) => {
    const request = await tx.hrTerminationRequest.findFirst({ where: { id, organizationId, status: "PENDING" }, include: { employee: true } });
    if (!request) throw new NotFoundError("Pending termination not found.");
    if (request.makerCheckerEnabled && request.initiatedById === reviewerId) throw new HrWorkflowError("The initiator cannot approve this termination.");
    await tx.hrTerminationRequest.update({ where: { id }, data: approved ? { status: "APPROVED", approvedById: reviewerId, reviewedAt: new Date() } : { status: "REJECTED", rejectedById: reviewerId, reviewedAt: new Date(), cancellationReason: reason } });
    if (!approved) {
      const previous = await tx.hrEmployeeStatusHistory.findFirst({ where: { terminationId: id }, orderBy: { createdAt: "asc" } });
      await tx.hrEmployee.update({ where: { id: request.employeeId }, data: { status: previous?.previousStatus ?? "ACTIVE" } });
      await tx.hrEmployeeStatusHistory.create({ data: { organizationId, employeeId: request.employeeId, previousStatus: "TERMINATION_PENDING", newStatus: previous?.previousStatus ?? "ACTIVE", effectiveDate: new Date(), reason: reason || "Termination rejected", initiatedById: request.initiatedById, approvedById: reviewerId, terminationId: id, metadata: { rejected: true } } });
      return request;
    }
    return applyApprovedTermination(tx, request, reviewerId);
  });
}

async function applyApprovedTermination(tx: Parameters<Parameters<typeof db.$transaction>[0]>[0], request: Awaited<ReturnType<typeof db.hrTerminationRequest.findFirst>> & { employee?: { userId: string | null } }, actorId?: string | null) {
  if (!request || request.status === "REJECTED" || request.effectiveDate > new Date()) return request;
  const employee = await tx.hrEmployee.findUniqueOrThrow({ where: { id: request.employeeId } });
  await tx.hrEmployee.update({ where: { id: employee.id }, data: { status: "TERMINATED", terminationDate: request.effectiveDate, payrollEligible: false } });
  await tx.hrTerminationRequest.update({ where: { id: request.id }, data: { status: "EFFECTIVE", effectiveAt: new Date() } });
  await tx.hrEmployeeStatusHistory.create({ data: { organizationId: request.organizationId, employeeId: employee.id, previousStatus: "TERMINATION_PENDING", newStatus: "TERMINATED", effectiveDate: request.effectiveDate, reason: request.reason, initiatedById: request.initiatedById, approvedById: request.approvedById || actorId, terminationId: request.id } });
  if (request.accessDisposition === "SUSPEND_ON_EFFECTIVE_DATE" && employee.userId) await tx.organizationMember.updateMany({ where: { organizationId: request.organizationId, userId: employee.userId, status: "ACTIVE" }, data: { status: "SUSPENDED" } });
  return request;
}

export async function processEffectiveTerminations(now = new Date()) {
  const ids = await db.hrTerminationRequest.findMany({ where: { status: "APPROVED", effectiveDate: { lte: now } }, select: { id: true, organizationId: true } });
  for (const item of ids) await db.$transaction(async (tx) => { const request = await tx.hrTerminationRequest.findFirst({ where: { id: item.id, organizationId: item.organizationId, status: "APPROVED" } }); if (request) await applyApprovedTermination(tx, request); });
  return ids.length;
}

export async function cancelTermination(organizationId: string, id: string, actorId: string, reason: string) {
  return db.$transaction(async (tx) => {
    const request = await tx.hrTerminationRequest.findFirst({ where: { id, organizationId, status: { in: ["PENDING", "APPROVED"] } } });
    if (!request) throw new NotFoundError("Cancellable termination not found.");
    const previous = await tx.hrEmployeeStatusHistory.findFirst({ where: { terminationId: id }, orderBy: { createdAt: "asc" } });
    await tx.hrTerminationRequest.update({ where: { id }, data: { status: "CANCELLED", cancelledById: actorId, cancellationReason: reason } });
    await tx.hrEmployee.update({ where: { id: request.employeeId }, data: { status: previous?.previousStatus ?? "ACTIVE" } });
    await tx.hrEmployeeStatusHistory.create({ data: { organizationId, employeeId: request.employeeId, previousStatus: "TERMINATION_PENDING", newStatus: previous?.previousStatus ?? "ACTIVE", effectiveDate: new Date(), reason, initiatedById: actorId, terminationId: id, metadata: { cancelled: true } } });
  });
}

export async function reinstateEmployee(organizationId: string, employeeId: string, actorId: string, data: { reason: string; effectiveDate: Date; jobTitle?: string | null; department?: string | null; managerId?: string | null; payrollEligible: boolean; restoreAccess: boolean }) {
  return db.$transaction(async (tx) => {
    const employee = await tx.hrEmployee.findFirst({ where: { id: employeeId, organizationId, status: "TERMINATED" } });
    if (!employee) throw new HrWorkflowError("Only a terminated employee can be reinstated.");
    if (data.managerId) { const manager = await tx.hrEmployee.findFirst({ where: { id: data.managerId, organizationId } }); if (!manager) throw new NotFoundError("Manager not found."); }
    await tx.hrEmployee.update({ where: { id: employee.id }, data: { status: "REINSTATED", terminationDate: null, payrollEligible: data.payrollEligible, jobTitle: data.jobTitle, department: data.department, managerId: data.managerId } });
    await tx.hrEmployeeStatusHistory.create({ data: { organizationId, employeeId, previousStatus: "TERMINATED", newStatus: "REINSTATED", effectiveDate: data.effectiveDate, reason: data.reason, initiatedById: actorId, approvedById: actorId, metadata: { payrollEligible: data.payrollEligible, restoreAccess: data.restoreAccess } } });
    if (data.restoreAccess && employee.userId) await tx.organizationMember.updateMany({ where: { organizationId, userId: employee.userId, status: "SUSPENDED" }, data: { status: "ACTIVE" } });
    const last = await tx.hrTerminationRequest.findFirst({ where: { organizationId, employeeId, status: "EFFECTIVE" }, orderBy: { effectiveDate: "desc" } });
    if (last) await tx.hrTerminationRequest.update({ where: { id: last.id }, data: { status: "REVERSED", reversalReason: data.reason } });
  });
}

export async function setOffboardingTaskCompletion(organizationId: string, taskId: string, actorId: string, completed: boolean, notes?: string | null) {
  return db.hrOffboardingTask.update({ where: { id: taskId, organizationId }, data: { completed, completedById: completed ? actorId : null, completedAt: completed ? new Date() : null, notes } });
}

// --- Launch Plan (onboarding/offboarding automation) ---
// Deliberately independent of HrTerminationRequest/HrOffboardingTask above -
// a standalone, manually-triggered checklist tool, not part of that
// approval chain. See docs/HR_MODULE.md.

export function listPlanTemplates(organizationId: string, kind?: HrPlanKind) {
  return db.hrPlanTemplate.findMany({
    where: { organizationId, ...(kind ? { kind } : {}) },
    include: { activities: { orderBy: { sortOrder: "asc" } } },
    orderBy: { name: "asc" },
  });
}

interface PlanTemplateActivityInput {
  title: string;
  activityType: HrPlanActivityType;
  dueDateOffsetDays: number;
  ownerRule: HrPlanOwnerRule;
}

export async function createPlanTemplate(organizationId: string, data: { kind: HrPlanKind; name: string; activities: PlanTemplateActivityInput[] }) {
  return db.hrPlanTemplate.create({
    data: {
      organizationId,
      kind: data.kind,
      name: data.name,
      activities: { create: data.activities.map((activity, index) => ({ ...activity, sortOrder: index })) },
    },
  });
}

export async function updatePlanTemplate(organizationId: string, id: string, data: { name: string; activities: PlanTemplateActivityInput[] }) {
  const template = await db.hrPlanTemplate.findFirst({ where: { id, organizationId } });
  if (!template) throw new NotFoundError("Plan template not found.");
  return db.$transaction([
    db.hrPlanTemplateActivity.deleteMany({ where: { templateId: id } }),
    db.hrPlanTemplate.update({
      where: { id },
      data: {
        name: data.name,
        activities: { create: data.activities.map((activity, index) => ({ ...activity, sortOrder: index })) },
      },
    }),
  ]);
}

export async function deletePlanTemplate(organizationId: string, id: string) {
  const template = await db.hrPlanTemplate.findFirst({ where: { id, organizationId } });
  if (!template) throw new NotFoundError("Plan template not found.");
  return db.hrPlanTemplate.delete({ where: { id } });
}

/** Resolves an activity's owner rule to a concrete platform-user id at launch
 * time, or null if that rule can't resolve to anyone with a linked account
 * (matching Odoo's own "X has no user" warning behavior - never guessed at). */
async function resolvePlanOwner(organizationId: string, rule: HrPlanOwnerRule, employee: { userId: string | null; manager: { userId: string | null } | null }) {
  if (rule === "EMPLOYEE") return employee.userId;
  if (rule === "MANAGER") return employee.manager?.userId ?? null;
  if (rule === "HR_MANAGER") {
    const holder = await db.organizationMember.findFirst({
      where: { organizationId, status: "ACTIVE", role: { rolePermissions: { some: { permission: { key: PERMISSIONS.HR_EMPLOYEES_MANAGE } } } } },
      orderBy: { createdAt: "asc" },
      select: { userId: true },
    });
    return holder?.userId ?? null;
  }
  return null;
}

export async function previewPlanLaunch(organizationId: string, data: { employeeId: string; templateId: string; targetDate: Date }) {
  const [employee, template] = await Promise.all([
    db.hrEmployee.findFirst({ where: { id: data.employeeId, organizationId }, include: { manager: true } }),
    db.hrPlanTemplate.findFirst({ where: { id: data.templateId, organizationId }, include: { activities: { orderBy: { sortOrder: "asc" } } } }),
  ]);
  if (!employee) throw new NotFoundError("Employee not found.");
  if (!template) throw new NotFoundError("Plan template not found.");
  return Promise.all(template.activities.map(async (activity) => ({
    title: activity.title,
    activityType: activity.activityType,
    dueDate: new Date(data.targetDate.getTime() + activity.dueDateOffsetDays * 86400000),
    ownerId: await resolvePlanOwner(organizationId, activity.ownerRule, employee),
  })));
}

export async function launchPlan(organizationId: string, data: { employeeId: string; kind: HrPlanKind; templateId: string; targetDate: Date; launchedById: string }) {
  const [employee, template] = await Promise.all([
    db.hrEmployee.findFirst({ where: { id: data.employeeId, organizationId }, include: { manager: true } }),
    db.hrPlanTemplate.findFirst({ where: { id: data.templateId, organizationId, kind: data.kind }, include: { activities: { orderBy: { sortOrder: "asc" } } } }),
  ]);
  if (!employee) throw new NotFoundError("Employee not found.");
  if (!template) throw new NotFoundError("Plan template not found.");
  const activities = await Promise.all(template.activities.map(async (activity, index) => ({
    title: activity.title,
    activityType: activity.activityType,
    dueDate: new Date(data.targetDate.getTime() + activity.dueDateOffsetDays * 86400000),
    ownerId: await resolvePlanOwner(organizationId, activity.ownerRule, employee),
    sortOrder: index,
  })));
  return db.hrPlanInstance.create({
    data: {
      organizationId,
      employeeId: data.employeeId,
      kind: data.kind,
      templateId: template.id,
      targetDate: data.targetDate,
      launchedById: data.launchedById,
      activities: { create: activities },
    },
    include: { activities: true },
  });
}

export function listPendingPlanActivities(organizationId: string, employeeId: string) {
  return db.hrPlanActivity.findMany({
    where: { status: "PENDING", instance: { organizationId, employeeId } },
    include: { instance: true },
    orderBy: { dueDate: "asc" },
  });
}

export async function completePlanActivity(organizationId: string, activityId: string, actorId: string) {
  const activity = await db.hrPlanActivity.findFirst({ where: { id: activityId, instance: { organizationId } } });
  if (!activity) throw new NotFoundError("Plan activity not found.");
  const updated = await db.hrPlanActivity.update({ where: { id: activityId }, data: { status: "DONE", completedAt: new Date() } });
  await logAuditEvent({ organizationId, userId: actorId, module: "hr", action: "plan_activity.completed", entityName: "HrPlanActivity", entityId: activityId });
  return updated;
}

// --- Leave types ---

export function listLeaveTypes(organizationId: string) {
  return db.hrLeaveType.findMany({ where: { organizationId }, orderBy: { name: "asc" } });
}

export function createLeaveType(organizationId: string, data: { name: string; defaultDaysPerYear: number }) {
  return db.hrLeaveType.create({ data: { organizationId, ...data } });
}

// --- Leave requests ---

export function listLeaveRequests(organizationId: string) {
  return db.hrLeaveRequest.findMany({
    where: { organizationId },
    include: { employee: true, leaveType: true, approvedBy: true },
    orderBy: { createdAt: "desc" },
  });
}

export function daysBetween(start: Date, end: Date) {
  const ms = end.getTime() - start.getTime();
  return Math.round(ms / 86400000) + 1;
}

interface LeaveRequestInput {
  employeeId: string;
  leaveTypeId: string;
  startDate: Date;
  endDate: Date;
  reason?: string | null;
}

export class LeaveDateError extends Error {}

export async function createLeaveRequest(organizationId: string, data: LeaveRequestInput) {
  if (data.endDate < data.startDate) throw new LeaveDateError("End date must be on or after the start date.");
  await requireEmployee(organizationId, data.employeeId);
  const leaveType = await db.hrLeaveType.findFirst({ where: { id: data.leaveTypeId, organizationId } });
  if (!leaveType) throw new NotFoundError("Leave type not found.");
  return db.hrLeaveRequest.create({ data: { organizationId, ...data } });
}

export class LeaveStateError extends Error {}

export async function approveLeaveRequest(organizationId: string, id: string, approvedById?: string | null) {
  const request = await db.hrLeaveRequest.findFirst({ where: { id, organizationId } });
  if (!request) throw new Error("Leave request not found.");
  if (request.status !== "PENDING") throw new LeaveStateError("Only pending leave requests can be approved.");
  return db.hrLeaveRequest.update({ where: { id }, data: { status: "APPROVED", approvedById, approvedAt: new Date() } });
}

export async function rejectLeaveRequest(organizationId: string, id: string, approvedById?: string | null) {
  const request = await db.hrLeaveRequest.findFirst({ where: { id, organizationId } });
  if (!request) throw new Error("Leave request not found.");
  if (request.status !== "PENDING") throw new LeaveStateError("Only pending leave requests can be rejected.");
  return db.hrLeaveRequest.update({ where: { id }, data: { status: "REJECTED", approvedById, approvedAt: new Date() } });
}

// --- Performance reviews ---

export function listReviews(organizationId: string) {
  return db.hrPerformanceReview.findMany({
    where: { organizationId },
    include: { employee: true, reviewedBy: true },
    orderBy: { createdAt: "desc" },
  });
}

interface ReviewInput {
  employeeId: string;
  reviewPeriodStart: Date;
  reviewPeriodEnd: Date;
  rating?: number | null;
  summary?: string | null;
  reviewedById?: string | null;
}

export async function createReview(organizationId: string, data: ReviewInput) {
  await requireEmployee(organizationId, data.employeeId);
  return db.hrPerformanceReview.create({ data: { organizationId, ...data, status: "DRAFT" } });
}

export class ReviewStateError extends Error {}

export async function completeReview(organizationId: string, id: string) {
  const review = await db.hrPerformanceReview.findFirst({ where: { id, organizationId } });
  if (!review) throw new Error("Review not found.");
  if (review.status !== "DRAFT") throw new ReviewStateError("Only draft reviews can be completed.");
  if (review.rating === null) throw new ReviewStateError("A rating is required before completing a review.");
  return db.hrPerformanceReview.update({ where: { id }, data: { status: "COMPLETED", reviewDate: new Date() } });
}

// --- Reports ---

export async function getHrSummary(organizationId: string) {
  const employees = await db.hrEmployee.findMany({ where: { organizationId } });
  const activeEmployees = employees.filter((e) => e.status === "ACTIVE");
  const onboardingEmployees = employees.filter((e) => e.status === "ONBOARDING");
  const onLeaveEmployees = employees.filter((e) => e.status === "ON_LEAVE");

  const departmentCounts = employees.reduce<Record<string, number>>((acc, e) => {
    if (e.status === "TERMINATED") return acc;
    const key = e.department ?? "Unassigned";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const [pendingLeaveCount, draftReviewCount] = await Promise.all([
    db.hrLeaveRequest.count({ where: { organizationId, status: "PENDING" } }),
    db.hrPerformanceReview.count({ where: { organizationId, status: "DRAFT" } }),
  ]);

  return {
    totalEmployees: employees.length,
    activeEmployeeCount: activeEmployees.length,
    onboardingCount: onboardingEmployees.length,
    onLeaveCount: onLeaveEmployees.length,
    pendingLeaveCount,
    draftReviewCount,
    departmentCounts,
  };
}
