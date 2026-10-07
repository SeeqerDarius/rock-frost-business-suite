import "server-only";

import { Prisma, type ContractObligationParty, type ContractObligationType, type ContractRecurrence, type ContractRiskLevel, type ContractStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { isValidCurrencyCode } from "@/lib/localization";
import {
  addMonths,
  AMENDABLE_FIELDS,
  buildCalendarEvents,
  ContractRuleError,
  diffContract,
  isStepApprover,
  nextOccurrence,
  noticeShortfallDays,
  parseAmendmentChanges,
  type AmendableField,
  type VersionedField,
} from "./rules";
import {
  accessSubject,
  accessWhere,
  auditChanges,
  can,
  closePendingApproval,
  ContractError,
  ContractForbiddenError,
  ContractNotFoundError,
  findApprovalRuleFor,
  getContractSettings,
  loadAccessibleContract,
  requirePermission,
  snapshotOf,
  type ContractActor,
  type Tx,
} from "./service";

const text = (value: string | null | undefined, max = 500) => (value?.trim() ? value.trim().slice(0, max) : null);
const lock = (tx: Tx, contractId: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`contract:${contractId}`}))`;

async function assertMember(client: Tx | typeof db, organizationId: string, userId: string, message = "User not found in this organization.") {
  const member = await client.organizationMember.findFirst({ where: { organizationId, userId, status: "ACTIVE" }, select: { id: true } });
  if (!member) throw new ContractNotFoundError(message);
}

/** Records a status or term change as a new contract version and returns the updated contract. */
async function writeVersion(
  tx: Tx,
  actor: ContractActor,
  current: Record<string, unknown> & { id: string; currentVersion: number },
  data: Prisma.ContractUpdateInput & Record<string, unknown>,
  reason: string,
) {
  const changes = diffContract(current as Partial<Record<VersionedField, unknown>>, data as Partial<Record<VersionedField, unknown>>);
  const version = current.currentVersion + 1;
  const updated = await tx.contract.update({ where: { id: current.id }, data: { ...data, currentVersion: version } });
  await tx.contractVersion.create({
    data: { organizationId: actor.organizationId, contractId: current.id, version, snapshot: snapshotOf(updated), changedFields: Object.keys(changes), changes: auditChanges(changes) as Prisma.InputJsonValue, reason: reason.slice(0, 500), changedById: actor.userId },
  });
  return { updated, version, changes };
}

// --- Notifications -------------------------------------------------------------

type ContractNotice = { type: string; title: string; message: string; contractId: string; extra?: Record<string, string | number | null> };

/** In-app notifications to users, de-duplicated, within one organization. */
export async function notifyUsers(tx: Tx | typeof db, organizationId: string, userIds: (string | null | undefined)[], notice: ContractNotice) {
  const recipients = [...new Set(userIds.filter((id): id is string => !!id))];
  if (!recipients.length) return 0;
  const sentAt = new Date();
  await tx.notification.createMany({
    data: recipients.map((userId) => ({
      organizationId, userId, type: notice.type, title: notice.title.slice(0, 200), message: notice.message.slice(0, 2000), status: "SENT" as const, sentAt,
      metadata: { contractId: notice.contractId, ...(notice.extra ?? {}) },
    })),
  });
  return recipients.length;
}

/** The users who can act on a step: the named approver, or the active members holding the role. */
async function stepRecipients(tx: Tx | typeof db, organizationId: string, step: { approverUserId: string | null; approverRoleId: string | null }) {
  if (step.approverUserId) return [step.approverUserId];
  if (!step.approverRoleId) return [];
  const members = await tx.organizationMember.findMany({ where: { organizationId, roleId: step.approverRoleId, status: "ACTIVE" }, select: { userId: true } });
  return members.map((member) => member.userId);
}

// --- Approval rules --------------------------------------------------------------

export type ApprovalRuleInput = {
  name: string;
  priority?: number;
  minValue?: string | null;
  currency?: string | null;
  categoryId?: string | null;
  typeId?: string | null;
  department?: string | null;
  minRiskLevel?: ContractRiskLevel | null;
  jurisdiction?: string | null;
  branchId?: string | null;
  steps: { name: string; approverUserId?: string | null; approverRoleId?: string | null }[];
};

export async function createApprovalRule(actor: ContractActor, input: ApprovalRuleInput) {
  requirePermission(actor, PERMISSIONS.CONTRACTS_MANAGE_SETTINGS);
  const name = input.name.trim();
  if (!name) throw new ContractError("Name the approval rule.");
  const priority = input.priority ?? 100;
  if (!Number.isInteger(priority) || priority < 1 || priority > 10_000) throw new ContractError("Priority must be a whole number from 1 to 10000.");
  let minValue: Prisma.Decimal | null = null;
  if (input.minValue?.trim()) {
    if (!/^\d{1,14}(\.\d{1,2})?$/.test(input.minValue.trim())) throw new ContractError("The value threshold must be zero or more with at most two decimal places.");
    minValue = new Prisma.Decimal(input.minValue.trim());
  }
  const currency = input.currency?.trim().toUpperCase() || null;
  if (currency && !isValidCurrencyCode(currency)) throw new ContractError("Choose a valid currency.");
  if (minValue && !currency) throw new ContractError("A value threshold needs a currency. Values in different currencies are never compared.");
  const steps = input.steps.filter((step) => step.approverUserId || step.approverRoleId);
  if (!steps.length) throw new ContractError("Add at least one approval step with an approver.");
  if (steps.length > 10) throw new ContractError("An approval chain can have at most 10 steps.");
  const org = actor.organizationId;
  for (const step of steps) {
    if (step.approverUserId && step.approverRoleId) throw new ContractError("Each step needs either a user or a role, not both.");
    if (step.approverUserId) await assertMember(db, org, step.approverUserId, "Approver not found in this organization.");
    if (step.approverRoleId && !(await db.role.findFirst({ where: { id: step.approverRoleId, OR: [{ organizationId: org }, { organizationId: null, isSystem: true }] }, select: { id: true } }))) throw new ContractNotFoundError("Role not found.");
  }
  const related: [string | null | undefined, () => Promise<unknown>, string][] = [
    [input.categoryId, () => db.contractCategory.findFirst({ where: { id: input.categoryId!, organizationId: org }, select: { id: true } }), "Category not found."],
    [input.typeId, () => db.contractType.findFirst({ where: { id: input.typeId!, organizationId: org }, select: { id: true } }), "Contract type not found."],
    [input.branchId, () => db.branch.findFirst({ where: { id: input.branchId!, organizationId: org }, select: { id: true } }), "Branch not found."],
  ];
  for (const [id, lookup, message] of related) if (id && !(await lookup())) throw new ContractNotFoundError(message);
  const rule = await db.contractApprovalRule.create({
    data: {
      organizationId: org, name: name.slice(0, 120), priority, minValue, currency, categoryId: input.categoryId || null, typeId: input.typeId || null, department: text(input.department, 120),
      minRiskLevel: input.minRiskLevel ?? null, jurisdiction: text(input.jurisdiction, 120), branchId: input.branchId || null, createdById: actor.userId,
      steps: { create: steps.map((step, index) => ({ organizationId: org, stepOrder: index + 1, name: step.name.trim().slice(0, 120) || `Step ${index + 1}`, approverUserId: step.approverUserId || null, approverRoleId: step.approverRoleId || null })) },
    },
    include: { steps: true },
  });
  await logAuditEvent({ organizationId: org, userId: actor.userId, module: "contracts", action: "contract_approval_rule.created", entityName: "ContractApprovalRule", entityId: rule.id, metadata: { name: rule.name, priority, steps: rule.steps.length } });
  return rule;
}

/** Rules are deactivated, not deleted, so the history of past approvals stays explainable. */
export async function setApprovalRuleActive(actor: ContractActor, ruleId: string, active: boolean) {
  requirePermission(actor, PERMISSIONS.CONTRACTS_MANAGE_SETTINGS);
  const result = await db.contractApprovalRule.updateMany({ where: { id: ruleId, organizationId: actor.organizationId }, data: { active } });
  if (result.count !== 1) throw new ContractNotFoundError("Approval rule not found.");
  await logAuditEvent({ organizationId: actor.organizationId, userId: actor.userId, module: "contracts", action: active ? "contract_approval_rule.activated" : "contract_approval_rule.deactivated", entityName: "ContractApprovalRule", entityId: ruleId });
}

export async function listApprovalRules(actor: ContractActor) {
  requirePermission(actor, PERMISSIONS.CONTRACTS_VIEW);
  return db.contractApprovalRule.findMany({ where: { organizationId: actor.organizationId }, include: { steps: { orderBy: { stepOrder: "asc" } } }, orderBy: [{ active: "desc" }, { priority: "asc" }, { name: "asc" }] });
}

// --- Approval workflow ---------------------------------------------------------------

export async function submitContractForApproval(actor: ContractActor, contractId: string, note?: string | null) {
  requirePermission(actor, PERMISSIONS.CONTRACTS_UPDATE);
  return db.$transaction(async (tx) => {
    await lock(tx, contractId);
    const contract = await loadAccessibleContract(actor, contractId, tx);
    if (contract.status !== "DRAFT") throw new ContractError("Only draft contracts can be submitted for approval.");
    const rule = await findApprovalRuleFor(tx, actor.organizationId, contract);
    if (!rule) throw new ContractError("No approval rule applies to this contract. It can be activated directly.");
    const { version } = await writeVersion(tx, actor, contract, { status: "PENDING_APPROVAL" }, `Submitted for approval (${rule.name})`);
    const now = new Date();
    const request = await tx.contractApprovalRequest.create({
      data: {
        organizationId: actor.organizationId, contractId, contractVersion: version, ruleId: rule.id, ruleName: rule.name, requestedById: actor.userId, note: text(note, 1000),
        steps: { create: rule.steps.map((step, index) => ({ organizationId: actor.organizationId, stepOrder: step.stepOrder, name: step.name, approverUserId: step.approverUserId, approverRoleId: step.approverRoleId, status: index === 0 ? "PENDING" : "WAITING", activatedAt: index === 0 ? now : null })) },
      },
      include: { steps: { orderBy: { stepOrder: "asc" } } },
    });
    const first = request.steps[0];
    await notifyUsers(tx, actor.organizationId, await stepRecipients(tx, actor.organizationId, first), { type: "CONTRACT_APPROVAL_REQUESTED", title: `Approval needed: ${contract.contractNumber}`, message: `${contract.title} is waiting for your approval (${first.name}).`, contractId, extra: { requestId: request.id } });
    await logAuditEvent({ organizationId: actor.organizationId, userId: actor.userId, module: "contracts", action: "contract.submitted_for_approval", entityName: "Contract", entityId: contractId, metadata: { requestId: request.id, rule: rule.name, steps: request.steps.length } }, tx);
    return request;
  }, { timeout: 20_000 });
}

export type ApprovalDecision = "APPROVE" | "REJECT" | "REQUEST_CHANGES";

export async function decideApprovalStep(actor: ContractActor, requestId: string, decision: ApprovalDecision, comment?: string | null) {
  requirePermission(actor, PERMISSIONS.CONTRACTS_APPROVE);
  const note = comment?.trim() || null;
  if (decision !== "APPROVE" && !note) throw new ContractError(decision === "REJECT" ? "Enter a reason for rejecting." : "Describe the changes needed.");
  const located = await db.contractApprovalRequest.findFirst({ where: { id: requestId, organizationId: actor.organizationId }, select: { contractId: true } });
  if (!located) throw new ContractNotFoundError("Approval request not found.");
  return db.$transaction(async (tx) => {
    await lock(tx, located.contractId);
    const contract = await loadAccessibleContract(actor, located.contractId, tx);
    const request = await tx.contractApprovalRequest.findFirstOrThrow({ where: { id: requestId }, include: { steps: { orderBy: { stepOrder: "asc" } } } });
    if (request.status !== "PENDING") throw new ContractError("This approval request is already closed.");
    if (contract.status !== "PENDING_APPROVAL" || contract.currentVersion !== request.contractVersion) throw new ContractError("The contract changed after it was submitted. It needs to be submitted again.");
    const step = request.steps.find((candidate) => candidate.status === "PENDING");
    if (!step) throw new ContractError("No approval step is waiting for a decision.");
    if (!isStepApprover(step, actor)) throw new ContractForbiddenError("You are not the approver for the current step.");
    const settings = await getContractSettings(actor.organizationId, tx);
    if (!settings.allowSelfApproval && request.requestedById === actor.userId) throw new ContractForbiddenError("You submitted this contract, so another approver must decide.");
    const now = new Date();
    const stepStatus = decision === "APPROVE" ? "APPROVED" : decision === "REJECT" ? "REJECTED" : "CHANGES_REQUESTED";
    await tx.contractApprovalStep.update({ where: { id: step.id }, data: { status: stepStatus, decidedById: actor.userId, decidedAt: now, comment: note?.slice(0, 2000) ?? null } });
    if (note) await tx.contractComment.create({ data: { organizationId: actor.organizationId, contractId: contract.id, approvalRequestId: request.id, authorId: actor.userId, body: note.slice(0, 5000) } });
    let outcome: "STEP_APPROVED" | "APPROVED" | "REJECTED" | "CHANGES_REQUESTED";
    if (decision === "APPROVE") {
      const next = request.steps.find((candidate) => candidate.stepOrder > step.stepOrder && candidate.status === "WAITING");
      if (next) {
        await tx.contractApprovalStep.update({ where: { id: next.id }, data: { status: "PENDING", activatedAt: now } });
        await notifyUsers(tx, actor.organizationId, await stepRecipients(tx, actor.organizationId, next), { type: "CONTRACT_APPROVAL_REQUESTED", title: `Approval needed: ${contract.contractNumber}`, message: `${contract.title} is waiting for your approval (${next.name}).`, contractId: contract.id, extra: { requestId: request.id } });
        outcome = "STEP_APPROVED";
      } else {
        await tx.contractApprovalRequest.update({ where: { id: request.id }, data: { status: "APPROVED", completedAt: now } });
        await writeVersion(tx, actor, contract, { status: "APPROVED" }, `Approved (${request.ruleName})`);
        outcome = "APPROVED";
      }
    } else {
      await closePendingApproval(tx, contract.id, decision === "REJECT" ? "REJECTED" : "CHANGES_REQUESTED");
      await writeVersion(tx, actor, contract, { status: "DRAFT" }, decision === "REJECT" ? `Approval rejected: ${note}` : `Changes requested: ${note}`);
      outcome = decision === "REJECT" ? "REJECTED" : "CHANGES_REQUESTED";
    }
    if (outcome !== "STEP_APPROVED") {
      const titles = { APPROVED: "Contract approved", REJECTED: "Contract rejected", CHANGES_REQUESTED: "Changes requested" } as const;
      await notifyUsers(tx, actor.organizationId, [request.requestedById, contract.ownerId], { type: `CONTRACT_${outcome}`, title: `${titles[outcome]}: ${contract.contractNumber}`, message: note ? `${contract.title}: ${note}` : `${contract.title} completed approval.`, contractId: contract.id, extra: { requestId: request.id } });
    }
    const auditAction = { STEP_APPROVED: "contract.approval_step_approved", APPROVED: "contract.approved", REJECTED: "contract.rejected", CHANGES_REQUESTED: "contract.changes_requested" }[outcome];
    await logAuditEvent({ organizationId: actor.organizationId, userId: actor.userId, module: "contracts", action: auditAction, entityName: "Contract", entityId: contract.id, metadata: { requestId: request.id, step: step.name, stepOrder: step.stepOrder, comment: note } }, tx);
    return { outcome };
  }, { timeout: 20_000 });
}

/** The requester (or a settings manager) withdraws a pending approval; the contract returns to draft. */
export async function withdrawApprovalRequest(actor: ContractActor, requestId: string, reason?: string | null) {
  const located = await db.contractApprovalRequest.findFirst({ where: { id: requestId, organizationId: actor.organizationId }, select: { contractId: true, requestedById: true, status: true } });
  if (!located) throw new ContractNotFoundError("Approval request not found.");
  if (located.requestedById !== actor.userId && !can(actor, PERMISSIONS.CONTRACTS_MANAGE_SETTINGS)) throw new ContractForbiddenError("Only the person who submitted the contract can withdraw it.");
  return db.$transaction(async (tx) => {
    await lock(tx, located.contractId);
    const contract = await loadAccessibleContract(actor, located.contractId, tx);
    if (located.status !== "PENDING") throw new ContractError("This approval request is already closed.");
    await closePendingApproval(tx, contract.id, "WITHDRAWN");
    await writeVersion(tx, actor, contract, { status: "DRAFT" }, `Approval withdrawn${reason?.trim() ? `: ${reason.trim()}` : ""}`);
    await logAuditEvent({ organizationId: actor.organizationId, userId: actor.userId, module: "contracts", action: "contract.approval_withdrawn", entityName: "Contract", entityId: contract.id, metadata: { requestId, reason: reason?.trim() || null } }, tx);
  }, { timeout: 20_000 });
}

/**
 * Hands the current step to another member. The current approver or a
 * settings manager can do this; marking it as an escalation records why.
 */
export async function reassignApprovalStep(actor: ContractActor, stepId: string, input: { approverUserId: string; escalate?: boolean; reason?: string | null }) {
  const located = await db.contractApprovalStep.findFirst({ where: { id: stepId, organizationId: actor.organizationId }, include: { request: { select: { id: true, contractId: true, status: true, requestedById: true } } } });
  if (!located) throw new ContractNotFoundError("Approval step not found.");
  return db.$transaction(async (tx) => {
    await lock(tx, located.request.contractId);
    const contract = await loadAccessibleContract(actor, located.request.contractId, tx);
    const step = await tx.contractApprovalStep.findUniqueOrThrow({ where: { id: stepId } });
    if (located.request.status !== "PENDING" || step.status !== "PENDING") throw new ContractError("Only the current step of a pending approval can be reassigned.");
    if (!isStepApprover(step, actor) && !can(actor, PERMISSIONS.CONTRACTS_MANAGE_SETTINGS)) throw new ContractForbiddenError("Only the current approver or a settings manager can reassign this step.");
    await assertMember(tx, actor.organizationId, input.approverUserId, "Approver not found in this organization.");
    const settings = await getContractSettings(actor.organizationId, tx);
    if (!settings.allowSelfApproval && input.approverUserId === located.request.requestedById) throw new ContractError("The person who submitted the contract cannot approve it.");
    await tx.contractApprovalStep.update({ where: { id: step.id }, data: { approverUserId: input.approverUserId, approverRoleId: null, escalated: step.escalated || !!input.escalate } });
    const reason = input.reason?.trim() || null;
    if (reason) await tx.contractComment.create({ data: { organizationId: actor.organizationId, contractId: contract.id, approvalRequestId: located.request.id, authorId: actor.userId, body: `${input.escalate ? "Escalated" : "Reassigned"}: ${reason}`.slice(0, 5000) } });
    await notifyUsers(tx, actor.organizationId, [input.approverUserId], { type: "CONTRACT_APPROVAL_REQUESTED", title: `${input.escalate ? "Escalated approval" : "Approval needed"}: ${contract.contractNumber}`, message: `${contract.title} is waiting for your approval (${step.name}).`, contractId: contract.id, extra: { requestId: located.request.id } });
    await logAuditEvent({ organizationId: actor.organizationId, userId: actor.userId, module: "contracts", action: input.escalate ? "contract.approval_escalated" : "contract.approval_reassigned", entityName: "Contract", entityId: contract.id, metadata: { stepId, from: { userId: step.approverUserId, roleId: step.approverRoleId }, to: input.approverUserId, reason } }, tx);
  });
}

export async function addContractComment(actor: ContractActor, contractId: string, body: string) {
  requirePermission(actor, PERMISSIONS.CONTRACTS_VIEW);
  const content = body.trim();
  if (!content) throw new ContractError("Write a comment.");
  return db.$transaction(async (tx) => {
    const contract = await loadAccessibleContract(actor, contractId, tx);
    const pending = await tx.contractApprovalRequest.findFirst({ where: { contractId: contract.id, status: "PENDING" }, select: { id: true } });
    const comment = await tx.contractComment.create({ data: { organizationId: actor.organizationId, contractId: contract.id, approvalRequestId: pending?.id ?? null, authorId: actor.userId, body: content.slice(0, 5000) } });
    await logAuditEvent({ organizationId: actor.organizationId, userId: actor.userId, module: "contracts", action: "contract.commented", entityName: "Contract", entityId: contract.id, metadata: { commentId: comment.id } }, tx);
    return comment;
  });
}

/** Steps waiting for the actor, directly or through their role. */
export async function listMyPendingApprovals(actor: ContractActor) {
  requirePermission(actor, PERMISSIONS.CONTRACTS_VIEW);
  const approver: Prisma.ContractApprovalStepWhereInput[] = [{ approverUserId: actor.userId }];
  if (actor.roleId) approver.push({ approverRoleId: actor.roleId });
  return db.contractApprovalStep.findMany({
    where: { organizationId: actor.organizationId, status: "PENDING", request: { status: "PENDING" }, OR: approver },
    include: { request: { include: { contract: { select: { id: true, contractNumber: true, title: true, counterpartyName: true, riskLevel: true } }, requestedBy: { select: { name: true, email: true } } } } },
    orderBy: { activatedAt: "asc" },
    take: 200,
  });
}

// --- Obligations ---------------------------------------------------------------------

const OPEN_CONTRACT_STATUSES: ContractStatus[] = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "ACTIVE", "EXPIRED"];

export type ObligationInput = { title: string; description?: string | null; obligationType: ContractObligationType; responsibleParty: ContractObligationParty; ownerId?: string | null; dueDate: Date; recurrence: ContractRecurrence };

export async function createObligation(actor: ContractActor, contractId: string, input: ObligationInput) {
  requirePermission(actor, PERMISSIONS.CONTRACTS_UPDATE);
  if (!input.title.trim()) throw new ContractError("Describe the obligation.");
  return db.$transaction(async (tx) => {
    const contract = await loadAccessibleContract(actor, contractId, tx);
    if (!OPEN_CONTRACT_STATUSES.includes(contract.status)) throw new ContractError("Obligations cannot be added to a closed contract.");
    if (input.ownerId) await assertMember(tx, actor.organizationId, input.ownerId, "Owner not found in this organization.");
    const obligation = await tx.contractObligation.create({
      data: { organizationId: actor.organizationId, contractId, title: input.title.trim().slice(0, 200), description: text(input.description, 5000), obligationType: input.obligationType, responsibleParty: input.responsibleParty, ownerId: input.ownerId || contract.ownerId, dueDate: input.dueDate, recurrence: input.recurrence, createdById: actor.userId },
    });
    await logAuditEvent({ organizationId: actor.organizationId, userId: actor.userId, module: "contracts", action: "contract.obligation_created", entityName: "Contract", entityId: contractId, metadata: { obligationId: obligation.id, title: obligation.title, dueDate: obligation.dueDate.toISOString().slice(0, 10), recurrence: obligation.recurrence } }, tx);
    return obligation;
  });
}

export type ObligationAction = "START" | "COMPLETE" | "WAIVE" | "REOPEN";

/**
 * Progresses an obligation. Its owner can update it; others need
 * contracts.update. Completing a recurring obligation schedules the next
 * occurrence, unless that falls after the contract's expiration date.
 */
export async function updateObligationStatus(actor: ContractActor, obligationId: string, action: ObligationAction, note?: string | null) {
  const located = await db.contractObligation.findFirst({ where: { id: obligationId, organizationId: actor.organizationId }, select: { contractId: true } });
  if (!located) throw new ContractNotFoundError("Obligation not found.");
  return db.$transaction(async (tx) => {
    await lock(tx, located.contractId);
    const contract = await loadAccessibleContract(actor, located.contractId, tx);
    const obligation = await tx.contractObligation.findUniqueOrThrow({ where: { id: obligationId } });
    if (obligation.ownerId !== actor.userId && !can(actor, PERMISSIONS.CONTRACTS_UPDATE)) throw new ContractForbiddenError("Only the obligation owner or a contract editor can update it.");
    const resolution = note?.trim() || null;
    const open = obligation.status === "OPEN" || obligation.status === "IN_PROGRESS";
    let next: { id: string; dueDate: Date } | null = null;
    if (action === "START") {
      if (obligation.status !== "OPEN") throw new ContractError("Only open obligations can be started.");
      await tx.contractObligation.update({ where: { id: obligation.id }, data: { status: "IN_PROGRESS" } });
    } else if (action === "COMPLETE" || action === "WAIVE") {
      if (!open) throw new ContractError("This obligation is already closed.");
      if (action === "WAIVE" && !resolution) throw new ContractError("Enter a reason for waiving the obligation.");
      await tx.contractObligation.update({ where: { id: obligation.id }, data: { status: action === "COMPLETE" ? "COMPLETED" : "WAIVED", completedAt: new Date(), completedById: actor.userId, resolutionNote: resolution?.slice(0, 1000) ?? null } });
      const nextDue = nextOccurrence(obligation.dueDate, obligation.recurrence);
      if (nextDue && (!contract.expirationDate || nextDue <= contract.expirationDate) && OPEN_CONTRACT_STATUSES.includes(contract.status)) {
        next = await tx.contractObligation.create({
          data: { organizationId: actor.organizationId, contractId: contract.id, title: obligation.title, description: obligation.description, obligationType: obligation.obligationType, responsibleParty: obligation.responsibleParty, ownerId: obligation.ownerId, dueDate: nextDue, recurrence: obligation.recurrence, previousId: obligation.id, createdById: actor.userId },
          select: { id: true, dueDate: true },
        });
      }
    } else {
      if (open) throw new ContractError("This obligation is already open.");
      await tx.contractObligation.update({ where: { id: obligation.id }, data: { status: "OPEN", completedAt: null, completedById: null, resolutionNote: resolution?.slice(0, 1000) ?? null } });
    }
    const audit = { START: "contract.obligation_started", COMPLETE: "contract.obligation_completed", WAIVE: "contract.obligation_waived", REOPEN: "contract.obligation_reopened" }[action];
    await logAuditEvent({ organizationId: actor.organizationId, userId: actor.userId, module: "contracts", action: audit, entityName: "Contract", entityId: contract.id, metadata: { obligationId, title: obligation.title, note: resolution, nextObligationId: next?.id ?? null, nextDueDate: next?.dueDate.toISOString().slice(0, 10) ?? null } }, tx);
    return { next };
  });
}

export type ObligationListFilter = "open" | "overdue" | "upcoming" | "completed" | "all";

/** Organization-wide obligations on contracts the actor can see. */
export async function listObligations(actor: ContractActor, filter: ObligationListFilter = "open", options: { mine?: boolean; take?: number } = {}) {
  requirePermission(actor, PERMISSIONS.CONTRACTS_VIEW);
  const subject = await accessSubject(actor);
  const now = new Date();
  const where: Prisma.ContractObligationWhereInput = { organizationId: actor.organizationId, contract: { AND: [accessWhere(subject), { status: { notIn: ["ARCHIVED", "CANCELLED"] } }] } };
  if (filter === "open") where.status = { in: ["OPEN", "IN_PROGRESS"] };
  else if (filter === "overdue") Object.assign(where, { status: { in: ["OPEN", "IN_PROGRESS"] }, dueDate: { lt: now } });
  else if (filter === "upcoming") Object.assign(where, { status: { in: ["OPEN", "IN_PROGRESS"] }, dueDate: { gte: now, lte: new Date(now.getTime() + 30 * 86_400_000) } });
  else if (filter === "completed") where.status = { in: ["COMPLETED", "WAIVED"] };
  if (options.mine) where.ownerId = actor.userId;
  return db.contractObligation.findMany({
    where,
    include: { contract: { select: { id: true, contractNumber: true, title: true, status: true } }, owner: { select: { name: true, email: true } } },
    orderBy: filter === "completed" ? [{ completedAt: "desc" }] : [{ dueDate: "asc" }],
    take: Math.min(options.take ?? 200, 500),
  });
}

// --- Milestones -----------------------------------------------------------------------

export async function createMilestone(actor: ContractActor, contractId: string, input: { title: string; description?: string | null; dueDate: Date; amount?: string | null }) {
  requirePermission(actor, PERMISSIONS.CONTRACTS_UPDATE);
  if (!input.title.trim()) throw new ContractError("Name the milestone.");
  let amount: Prisma.Decimal | null = null;
  if (input.amount?.trim()) {
    if (!can(actor, PERMISSIONS.CONTRACTS_VIEW_FINANCIALS)) throw new ContractForbiddenError("Milestone amounts need financial access.");
    if (!/^\d{1,14}(\.\d{1,2})?$/.test(input.amount.trim())) throw new ContractError("The milestone amount must be zero or more with at most two decimal places.");
    amount = new Prisma.Decimal(input.amount.trim());
  }
  return db.$transaction(async (tx) => {
    const contract = await loadAccessibleContract(actor, contractId, tx);
    if (!OPEN_CONTRACT_STATUSES.includes(contract.status)) throw new ContractError("Milestones cannot be added to a closed contract.");
    const milestone = await tx.contractMilestone.create({ data: { organizationId: actor.organizationId, contractId, title: input.title.trim().slice(0, 200), description: text(input.description, 5000), dueDate: input.dueDate, amount, createdById: actor.userId } });
    await logAuditEvent({ organizationId: actor.organizationId, userId: actor.userId, module: "contracts", action: "contract.milestone_created", entityName: "Contract", entityId: contractId, metadata: { milestoneId: milestone.id, title: milestone.title, dueDate: milestone.dueDate.toISOString().slice(0, 10) } }, tx);
    return milestone;
  });
}

export async function setMilestoneStatus(actor: ContractActor, milestoneId: string, status: "ACHIEVED" | "MISSED" | "CANCELLED" | "PLANNED", note?: string | null) {
  requirePermission(actor, PERMISSIONS.CONTRACTS_UPDATE);
  const located = await db.contractMilestone.findFirst({ where: { id: milestoneId, organizationId: actor.organizationId }, select: { contractId: true } });
  if (!located) throw new ContractNotFoundError("Milestone not found.");
  return db.$transaction(async (tx) => {
    const contract = await loadAccessibleContract(actor, located.contractId, tx);
    const milestone = await tx.contractMilestone.findUniqueOrThrow({ where: { id: milestoneId } });
    if (milestone.status === status) throw new ContractError(`The milestone is already ${status.toLowerCase()}.`);
    if ((status === "MISSED" || status === "CANCELLED") && !note?.trim()) throw new ContractError("Add a note explaining the change.");
    await tx.contractMilestone.update({ where: { id: milestone.id }, data: { status, achievedAt: status === "ACHIEVED" ? new Date() : null, note: text(note, 1000) ?? milestone.note, recordedById: actor.userId } });
    await logAuditEvent({ organizationId: actor.organizationId, userId: actor.userId, module: "contracts", action: "contract.milestone_updated", entityName: "Contract", entityId: contract.id, metadata: { milestoneId, title: milestone.title, from: milestone.status, to: status, note: note?.trim() || null } }, tx);
  });
}

// --- Renewals --------------------------------------------------------------------------

/** The next expiration date proposed from the renewal term, or null when no term is set. */
export function proposedRenewalDate(contract: { expirationDate: Date | null; renewalTermMonths: number | null }) {
  return contract.expirationDate && contract.renewalTermMonths ? addMonths(contract.expirationDate, contract.renewalTermMonths) : null;
}

export async function renewContract(actor: ContractActor, contractId: string, input: { newExpirationDate: Date; newValue?: string | null; reason?: string | null }) {
  requirePermission(actor, PERMISSIONS.CONTRACTS_RENEW);
  return db.$transaction(async (tx) => {
    await lock(tx, contractId);
    const contract = await loadAccessibleContract(actor, contractId, tx);
    if (contract.status !== "ACTIVE" && contract.status !== "EXPIRED") throw new ContractError("Only active or expired contracts can be renewed.");
    if (contract.expirationDate && input.newExpirationDate <= contract.expirationDate) throw new ContractError("The new expiration date must be after the current one.");
    if (contract.startDate && input.newExpirationDate < contract.startDate) throw new ContractError("The new expiration date cannot be before the start date.");
    let newValue: Prisma.Decimal | null = contract.value;
    if (input.newValue?.trim()) {
      if (!can(actor, PERMISSIONS.CONTRACTS_VIEW_FINANCIALS)) throw new ContractForbiddenError("Changing the value needs financial access.");
      if (!/^\d{1,14}(\.\d{1,2})?$/.test(input.newValue.trim())) throw new ContractError("The renewal value must be zero or more with at most two decimal places.");
      newValue = new Prisma.Decimal(input.newValue.trim());
    }
    const reason = input.reason?.trim() || null;
    const data: Prisma.ContractUpdateInput & Record<string, unknown> = { expirationDate: input.newExpirationDate, value: newValue, status: "ACTIVE", renewalDate: contract.renewalDate && contract.renewalDate > new Date() ? contract.renewalDate : null };
    const { version } = await writeVersion(tx, actor, contract, data, `Renewed to ${input.newExpirationDate.toISOString().slice(0, 10)}${reason ? `: ${reason}` : ""}`);
    const renewal = await tx.contractRenewal.create({ data: { organizationId: actor.organizationId, contractId, decision: "RENEWED", previousExpirationDate: contract.expirationDate, newExpirationDate: input.newExpirationDate, previousValue: contract.value, newValue, reason: reason?.slice(0, 1000) ?? null, contractVersion: version, decidedById: actor.userId } });
    await logAuditEvent({ organizationId: actor.organizationId, userId: actor.userId, module: "contracts", action: "contract.renewed", entityName: "Contract", entityId: contractId, metadata: { renewalId: renewal.id, from: contract.expirationDate?.toISOString().slice(0, 10) ?? null, to: input.newExpirationDate.toISOString().slice(0, 10), valueChanged: (newValue?.toFixed(2) ?? null) !== (contract.value?.toFixed(2) ?? null), reason } }, tx);
    return renewal;
  }, { timeout: 20_000 });
}

/** Records a decision not to renew. The renewal type becomes "no renewal" so reminders and dashboards reflect it. */
export async function recordNonRenewal(actor: ContractActor, contractId: string, input: { reason: string; noticeGivenAt?: Date | null }) {
  requirePermission(actor, PERMISSIONS.CONTRACTS_RENEW);
  const reason = input.reason.trim();
  if (!reason) throw new ContractError("Enter the reason for not renewing.");
  return db.$transaction(async (tx) => {
    await lock(tx, contractId);
    const contract = await loadAccessibleContract(actor, contractId, tx);
    if (contract.status !== "ACTIVE") throw new ContractError("Only active contracts can be marked as not renewing.");
    const data: Prisma.ContractUpdateInput & Record<string, unknown> = { renewalType: "NO_RENEWAL", noticeGivenAt: input.noticeGivenAt ?? contract.noticeGivenAt };
    const { version } = await writeVersion(tx, actor, contract, data, `Not renewing: ${reason}`);
    const renewal = await tx.contractRenewal.create({ data: { organizationId: actor.organizationId, contractId, decision: "NOT_RENEWING", previousExpirationDate: contract.expirationDate, reason: reason.slice(0, 1000), contractVersion: version, decidedById: actor.userId } });
    await logAuditEvent({ organizationId: actor.organizationId, userId: actor.userId, module: "contracts", action: "contract.not_renewing", entityName: "Contract", entityId: contractId, metadata: { renewalId: renewal.id, reason, noticeGivenAt: input.noticeGivenAt?.toISOString().slice(0, 10) ?? null } }, tx);
    return renewal;
  }, { timeout: 20_000 });
}

// --- Amendments ------------------------------------------------------------------------

const AMENDABLE_STATUSES: ContractStatus[] = ["APPROVED", "ACTIVE"];

export async function createAmendment(actor: ContractActor, contractId: string, input: { title: string; reason: string; effectiveDate?: Date | null; changes: Partial<Record<AmendableField, string | null>> }) {
  requirePermission(actor, PERMISSIONS.CONTRACTS_UPDATE);
  if (!input.title.trim() || !input.reason.trim()) throw new ContractError("Give the amendment a title and a reason.");
  let changes: Partial<Record<AmendableField, string | number>>;
  try {
    changes = parseAmendmentChanges(input.changes);
  } catch (error) {
    if (error instanceof ContractRuleError) throw new ContractError(error.message);
    throw error;
  }
  if (("value" in changes || "paymentTerms" in changes || "billingFrequency" in changes) && !can(actor, PERMISSIONS.CONTRACTS_VIEW_FINANCIALS)) throw new ContractForbiddenError("Amending financial terms needs financial access.");
  if (typeof changes.currency === "string" && !isValidCurrencyCode(changes.currency)) throw new ContractError("Choose a valid currency.");
  return db.$transaction(async (tx) => {
    await lock(tx, contractId);
    const contract = await loadAccessibleContract(actor, contractId, tx);
    if (!AMENDABLE_STATUSES.includes(contract.status)) throw new ContractError("Amendments apply to approved or active contracts. Edit a draft directly.");
    const last = await tx.contractAmendment.findFirst({ where: { contractId }, orderBy: { amendmentNumber: "desc" }, select: { amendmentNumber: true } });
    const amendment = await tx.contractAmendment.create({ data: { organizationId: actor.organizationId, contractId, amendmentNumber: (last?.amendmentNumber ?? 0) + 1, title: input.title.trim().slice(0, 200), reason: input.reason.trim().slice(0, 5000), effectiveDate: input.effectiveDate ?? null, changes: changes as Prisma.InputJsonValue, createdById: actor.userId } });
    await logAuditEvent({ organizationId: actor.organizationId, userId: actor.userId, module: "contracts", action: "contract.amendment_created", entityName: "Contract", entityId: contractId, metadata: { amendmentId: amendment.id, number: amendment.amendmentNumber, fields: Object.keys(changes) } }, tx);
    return amendment;
  }, { timeout: 20_000 });
}

/** Converts stored amendment JSON into contract column values. */
function amendmentData(changes: Record<string, unknown>) {
  const data: Record<string, unknown> = {};
  for (const field of AMENDABLE_FIELDS) {
    if (!(field in changes)) continue;
    const value = changes[field];
    if (field === "value") data.value = new Prisma.Decimal(String(value));
    else if (field === "expirationDate" || field === "renewalDate") data[field] = new Date(`${String(value)}T00:00:00.000Z`);
    else data[field] = value;
  }
  return data;
}

/**
 * Applies an amendment as a new contract version. Requires approval
 * permission, and someone other than its author unless self-approval is
 * allowed in settings.
 */
export async function applyAmendment(actor: ContractActor, amendmentId: string) {
  requirePermission(actor, PERMISSIONS.CONTRACTS_APPROVE);
  const located = await db.contractAmendment.findFirst({ where: { id: amendmentId, organizationId: actor.organizationId }, select: { contractId: true } });
  if (!located) throw new ContractNotFoundError("Amendment not found.");
  return db.$transaction(async (tx) => {
    await lock(tx, located.contractId);
    const contract = await loadAccessibleContract(actor, located.contractId, tx);
    const amendment = await tx.contractAmendment.findUniqueOrThrow({ where: { id: amendmentId } });
    if (amendment.status !== "DRAFT") throw new ContractError("This amendment is already applied or cancelled.");
    if (!AMENDABLE_STATUSES.includes(contract.status)) throw new ContractError("Amendments apply to approved or active contracts.");
    const settings = await getContractSettings(actor.organizationId, tx);
    if (!settings.allowSelfApproval && amendment.createdById === actor.userId) throw new ContractForbiddenError("You drafted this amendment, so someone else must apply it.");
    const data = amendmentData(amendment.changes as Record<string, unknown>);
    const expiration = (data.expirationDate as Date | undefined) ?? contract.expirationDate;
    if (expiration && contract.startDate && expiration < contract.startDate) throw new ContractError("The amended expiration date cannot be before the start date.");
    const { version, changes } = await writeVersion(tx, actor, contract, data as Prisma.ContractUpdateInput & Record<string, unknown>, `Amendment ${amendment.amendmentNumber}: ${amendment.title}`);
    if (!Object.keys(changes).length) throw new ContractError("The amendment does not change any current term.");
    await tx.contractAmendment.update({ where: { id: amendment.id }, data: { status: "APPLIED", appliedVersion: version, appliedAt: new Date(), appliedById: actor.userId } });
    await logAuditEvent({ organizationId: actor.organizationId, userId: actor.userId, module: "contracts", action: "contract.amendment_applied", entityName: "Contract", entityId: contract.id, metadata: { amendmentId, number: amendment.amendmentNumber, version, changes: auditChanges(changes) } }, tx);
    return { version };
  }, { timeout: 20_000 });
}

export async function cancelAmendment(actor: ContractActor, amendmentId: string) {
  requirePermission(actor, PERMISSIONS.CONTRACTS_UPDATE);
  const located = await db.contractAmendment.findFirst({ where: { id: amendmentId, organizationId: actor.organizationId }, select: { contractId: true, status: true, amendmentNumber: true } });
  if (!located) throw new ContractNotFoundError("Amendment not found.");
  return db.$transaction(async (tx) => {
    await loadAccessibleContract(actor, located.contractId, tx);
    const result = await tx.contractAmendment.updateMany({ where: { id: amendmentId, status: "DRAFT" }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelledById: actor.userId } });
    if (result.count !== 1) throw new ContractError("Only draft amendments can be cancelled.");
    await logAuditEvent({ organizationId: actor.organizationId, userId: actor.userId, module: "contracts", action: "contract.amendment_cancelled", entityName: "Contract", entityId: located.contractId, metadata: { amendmentId, number: located.amendmentNumber } }, tx);
  });
}

// --- Termination -----------------------------------------------------------------------

/**
 * Terminates an active contract. When the notice given is shorter than the
 * contract's notice period, the user must acknowledge the shortfall. Open
 * obligations due after the effective date are waived with a recorded note.
 */
export async function terminateContract(actor: ContractActor, contractId: string, input: { effectiveDate: Date; noticeGivenAt?: Date | null; reason: string; acknowledgeShortNotice?: boolean }) {
  requirePermission(actor, PERMISSIONS.CONTRACTS_TERMINATE);
  const reason = input.reason.trim();
  if (!reason) throw new ContractError("Enter the reason for termination.");
  return db.$transaction(async (tx) => {
    await lock(tx, contractId);
    const contract = await loadAccessibleContract(actor, contractId, tx);
    if (contract.status !== "ACTIVE") throw new ContractError("Only active contracts can be terminated. Cancel a contract that has not started.");
    const noticeGivenAt = input.noticeGivenAt ?? contract.noticeGivenAt ?? new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
    if (input.effectiveDate < noticeGivenAt) throw new ContractError("The effective date cannot be before notice was given.");
    if (contract.startDate && input.effectiveDate < contract.startDate) throw new ContractError("The effective date cannot be before the contract started.");
    const shortfall = noticeShortfallDays(noticeGivenAt, input.effectiveDate, contract.noticePeriodDays);
    if (shortfall > 0 && !input.acknowledgeShortNotice) throw new ContractError(`The notice given is ${shortfall} day${shortfall === 1 ? "" : "s"} shorter than the ${contract.noticePeriodDays}-day notice period. Confirm the short notice to continue.`);
    const data: Prisma.ContractUpdateInput & Record<string, unknown> = { status: "TERMINATED", noticeGivenAt, terminationEffectiveDate: input.effectiveDate, terminationReason: reason.slice(0, 1000), terminatedAt: new Date() };
    const { version } = await writeVersion(tx, actor, contract, data, `Terminated: ${reason}`);
    const waived = await tx.contractObligation.updateMany({ where: { contractId, status: { in: ["OPEN", "IN_PROGRESS"] }, dueDate: { gt: input.effectiveDate } }, data: { status: "WAIVED", completedAt: new Date(), completedById: actor.userId, resolutionNote: `Contract terminated effective ${input.effectiveDate.toISOString().slice(0, 10)}.` } });
    await tx.contractMilestone.updateMany({ where: { contractId, status: "PLANNED", dueDate: { gt: input.effectiveDate } }, data: { status: "CANCELLED", note: "Contract terminated.", recordedById: actor.userId } });
    await notifyUsers(tx, actor.organizationId, [contract.ownerId, contract.createdById].filter((id) => id !== actor.userId), { type: "CONTRACT_TERMINATED", title: `Contract terminated: ${contract.contractNumber}`, message: `${contract.title} was terminated effective ${input.effectiveDate.toISOString().slice(0, 10)}. Reason: ${reason}`, contractId });
    await logAuditEvent({ organizationId: actor.organizationId, userId: actor.userId, module: "contracts", action: "contract.terminated", entityName: "Contract", entityId: contractId, metadata: { version, reason, effectiveDate: input.effectiveDate.toISOString().slice(0, 10), noticeGivenAt: noticeGivenAt.toISOString().slice(0, 10), shortNoticeDays: shortfall, obligationsWaived: waived.count } }, tx);
    return { version, shortNoticeDays: shortfall, obligationsWaived: waived.count };
  }, { timeout: 20_000 });
}

// --- Signatures --------------------------------------------------------------------------

async function documentOnContract(tx: Tx, contractId: string, documentId: string | null | undefined) {
  if (!documentId) return null;
  const document = await tx.contractDocument.findFirst({ where: { id: documentId, contractId, removedAt: null }, select: { id: true, title: true, version: true, checksumSha256: true } });
  if (!document) throw new ContractNotFoundError("Document not found on this contract.");
  return document;
}

/** Asks an internal user to acknowledge the contract in the application. This is not an electronic signature. */
export async function requestInternalAcknowledgement(actor: ContractActor, contractId: string, input: { signerUserId: string; documentId?: string | null }) {
  requirePermission(actor, PERMISSIONS.CONTRACTS_UPDATE);
  return db.$transaction(async (tx) => {
    const contract = await loadAccessibleContract(actor, contractId, tx);
    if (!["APPROVED", "ACTIVE"].includes(contract.status)) throw new ContractError("Acknowledgements are requested on approved or active contracts.");
    const member = await tx.organizationMember.findFirst({ where: { organizationId: actor.organizationId, userId: input.signerUserId, status: "ACTIVE" }, select: { user: { select: { name: true, email: true } } } });
    if (!member) throw new ContractNotFoundError("User not found in this organization.");
    const document = await documentOnContract(tx, contractId, input.documentId);
    if (await tx.contractSignature.findFirst({ where: { contractId, signerUserId: input.signerUserId, status: "PENDING" }, select: { id: true } })) throw new ContractError("That person already has a pending acknowledgement on this contract.");
    const signature = await tx.contractSignature.create({ data: { organizationId: actor.organizationId, contractId, documentId: document?.id ?? null, method: "INTERNAL_ACKNOWLEDGEMENT", signerName: member.user.name ?? member.user.email, signerEmail: member.user.email, signerUserId: input.signerUserId, requestedById: actor.userId } });
    await notifyUsers(tx, actor.organizationId, [input.signerUserId], { type: "CONTRACT_ACKNOWLEDGEMENT_REQUESTED", title: `Acknowledgement requested: ${contract.contractNumber}`, message: `Please review and acknowledge ${contract.title}.`, contractId, extra: { signatureId: signature.id } });
    await logAuditEvent({ organizationId: actor.organizationId, userId: actor.userId, module: "contracts", action: "contract.acknowledgement_requested", entityName: "Contract", entityId: contractId, metadata: { signatureId: signature.id, signerUserId: input.signerUserId, documentId: document?.id ?? null } }, tx);
    return signature;
  });
}

/** The requested signer acknowledges or declines. Only that user can respond. */
export async function respondToAcknowledgement(actor: ContractActor, signatureId: string, response: "ACKNOWLEDGE" | "DECLINE", note?: string | null) {
  requirePermission(actor, PERMISSIONS.CONTRACTS_VIEW);
  const located = await db.contractSignature.findFirst({ where: { id: signatureId, organizationId: actor.organizationId }, select: { contractId: true } });
  if (!located) throw new ContractNotFoundError("Acknowledgement not found.");
  return db.$transaction(async (tx) => {
    const contract = await loadAccessibleContract(actor, located.contractId, tx);
    const signature = await tx.contractSignature.findUniqueOrThrow({ where: { id: signatureId } });
    if (signature.method !== "INTERNAL_ACKNOWLEDGEMENT" || signature.signerUserId !== actor.userId) throw new ContractForbiddenError("Only the requested person can respond.");
    if (signature.status !== "PENDING") throw new ContractError("This acknowledgement is already closed.");
    if (response === "DECLINE" && !note?.trim()) throw new ContractError("Enter a reason for declining.");
    const document = signature.documentId ? await tx.contractDocument.findFirst({ where: { id: signature.documentId }, select: { checksumSha256: true, version: true } }) : null;
    await tx.contractSignature.update({ where: { id: signature.id }, data: { status: response === "ACKNOWLEDGE" ? "SIGNED" : "DECLINED", completedAt: new Date(), evidenceNote: text(note, 1000), recordedById: actor.userId } });
    await notifyUsers(tx, actor.organizationId, [signature.requestedById], { type: response === "ACKNOWLEDGE" ? "CONTRACT_ACKNOWLEDGED" : "CONTRACT_ACKNOWLEDGEMENT_DECLINED", title: `${response === "ACKNOWLEDGE" ? "Acknowledged" : "Declined"}: ${contract.contractNumber}`, message: `${signature.signerName} ${response === "ACKNOWLEDGE" ? "acknowledged" : "declined"} ${contract.title}.`, contractId: contract.id, extra: { signatureId } });
    await logAuditEvent({ organizationId: actor.organizationId, userId: actor.userId, module: "contracts", action: response === "ACKNOWLEDGE" ? "contract.acknowledged" : "contract.acknowledgement_declined", entityName: "Contract", entityId: contract.id, metadata: { signatureId, documentId: signature.documentId, documentVersion: document?.version ?? null, documentChecksumSha256: document?.checksumSha256 ?? null, contractVersion: contract.currentVersion, note: note?.trim() || null } }, tx);
  });
}

/** Records a signature obtained outside the application (wet ink or another tool), with its evidence. */
export async function recordExternalSignature(actor: ContractActor, contractId: string, input: { signerName: string; signerEmail?: string | null; signerTitle?: string | null; partyId?: string | null; documentId?: string | null; signedAt: Date; evidenceNote?: string | null }) {
  requirePermission(actor, PERMISSIONS.CONTRACTS_UPDATE);
  if (!input.signerName.trim()) throw new ContractError("Enter the signer's name.");
  if (input.signedAt > new Date()) throw new ContractError("The signing date cannot be in the future.");
  return db.$transaction(async (tx) => {
    const contract = await loadAccessibleContract(actor, contractId, tx);
    if (["CANCELLED", "ARCHIVED"].includes(contract.status)) throw new ContractError("Signatures cannot be recorded on a cancelled or archived contract.");
    if (input.partyId && !(await tx.contractParty.findFirst({ where: { id: input.partyId, contractId }, select: { id: true } }))) throw new ContractNotFoundError("Party not found on this contract.");
    const document = await documentOnContract(tx, contractId, input.documentId);
    const signature = await tx.contractSignature.create({ data: { organizationId: actor.organizationId, contractId, documentId: document?.id ?? null, partyId: input.partyId || null, method: "RECORDED_EXTERNAL", status: "SIGNED", signerName: input.signerName.trim().slice(0, 200), signerEmail: text(input.signerEmail, 320), signerTitle: text(input.signerTitle, 120), evidenceNote: text(input.evidenceNote, 1000), requestedById: actor.userId, completedAt: input.signedAt, recordedById: actor.userId } });
    await logAuditEvent({ organizationId: actor.organizationId, userId: actor.userId, module: "contracts", action: "contract.signature_recorded", entityName: "Contract", entityId: contractId, metadata: { signatureId: signature.id, signerName: signature.signerName, partyId: signature.partyId, documentId: document?.id ?? null, documentChecksumSha256: document?.checksumSha256 ?? null, signedAt: input.signedAt.toISOString().slice(0, 10) } }, tx);
    return signature;
  });
}

export async function cancelSignatureRequest(actor: ContractActor, signatureId: string) {
  requirePermission(actor, PERMISSIONS.CONTRACTS_UPDATE);
  const located = await db.contractSignature.findFirst({ where: { id: signatureId, organizationId: actor.organizationId }, select: { contractId: true } });
  if (!located) throw new ContractNotFoundError("Signature request not found.");
  return db.$transaction(async (tx) => {
    await loadAccessibleContract(actor, located.contractId, tx);
    const result = await tx.contractSignature.updateMany({ where: { id: signatureId, status: "PENDING" }, data: { status: "CANCELLED", completedAt: new Date(), recordedById: actor.userId } });
    if (result.count !== 1) throw new ContractError("Only pending requests can be cancelled.");
    await logAuditEvent({ organizationId: actor.organizationId, userId: actor.userId, module: "contracts", action: "contract.signature_cancelled", entityName: "Contract", entityId: located.contractId, metadata: { signatureId } }, tx);
  });
}

/** Acknowledgements waiting for the actor. */
export async function listMyPendingAcknowledgements(actor: ContractActor) {
  requirePermission(actor, PERMISSIONS.CONTRACTS_VIEW);
  return db.contractSignature.findMany({ where: { organizationId: actor.organizationId, signerUserId: actor.userId, status: "PENDING" }, include: { contract: { select: { id: true, contractNumber: true, title: true } } }, orderBy: { requestedAt: "asc" }, take: 100 });
}

// --- Reads -------------------------------------------------------------------------------

/** Lifecycle records for the contract detail page. Financial amounts are hidden without financial access. */
export async function getContractLifecycle(actor: ContractActor, contractId: string) {
  const contract = await loadAccessibleContract(actor, contractId);
  const [approvalRequests, comments, obligations, milestones, amendments, renewals, signatures, applicableRule] = await Promise.all([
    db.contractApprovalRequest.findMany({ where: { contractId: contract.id }, orderBy: { requestedAt: "desc" }, take: 20, include: { requestedBy: { select: { name: true, email: true } }, steps: { orderBy: { stepOrder: "asc" }, include: { approverUser: { select: { name: true, email: true } }, decidedBy: { select: { name: true, email: true } } } } } }),
    db.contractComment.findMany({ where: { contractId: contract.id }, orderBy: { createdAt: "desc" }, take: 100, include: { author: { select: { name: true, email: true } } } }),
    db.contractObligation.findMany({ where: { contractId: contract.id }, orderBy: [{ status: "asc" }, { dueDate: "asc" }], take: 200, include: { owner: { select: { name: true, email: true } } } }),
    db.contractMilestone.findMany({ where: { contractId: contract.id }, orderBy: { dueDate: "asc" }, take: 200 }),
    db.contractAmendment.findMany({ where: { contractId: contract.id }, orderBy: { amendmentNumber: "desc" }, include: { createdBy: { select: { name: true, email: true } } } }),
    db.contractRenewal.findMany({ where: { contractId: contract.id }, orderBy: { createdAt: "desc" } }),
    db.contractSignature.findMany({ where: { contractId: contract.id }, orderBy: { requestedAt: "desc" } }),
    contract.status === "DRAFT" ? findApprovalRuleFor(db, actor.organizationId, contract) : Promise.resolve(null),
  ]);
  const financial = can(actor, PERMISSIONS.CONTRACTS_VIEW_FINANCIALS);
  const hideFinancialChanges = (changes: Prisma.JsonValue) => {
    if (financial || !changes || typeof changes !== "object" || Array.isArray(changes)) return changes;
    const copy: Record<string, unknown> = { ...(changes as Record<string, unknown>) };
    for (const field of ["value", "paymentTerms", "billingFrequency"]) if (field in copy) copy[field] = "hidden";
    return copy as Prisma.JsonValue;
  };
  return {
    approvalRequests,
    comments,
    obligations,
    milestones: milestones.map((milestone) => ({ ...milestone, amount: financial ? milestone.amount : null })),
    amendments: amendments.map((amendment) => ({ ...amendment, changes: hideFinancialChanges(amendment.changes) })),
    renewals: renewals.map((renewal) => ({ ...renewal, previousValue: financial ? renewal.previousValue : null, newValue: financial ? renewal.newValue : null })),
    signatures,
    applicableRule: applicableRule ? { name: applicableRule.name, steps: applicableRule.steps.map((step) => step.name) } : null,
    proposedRenewalDate: proposedRenewalDate(contract),
  };
}

/** Calendar events for [from, to) on contracts the actor can see. */
export async function getContractCalendar(actor: ContractActor, from: Date, to: Date) {
  requirePermission(actor, PERMISSIONS.CONTRACTS_VIEW);
  const subject = await accessSubject(actor);
  const visible: Prisma.ContractWhereInput = { AND: [{ organizationId: actor.organizationId, status: { in: ["APPROVED", "ACTIVE"] } }, accessWhere(subject)] };
  const noticeHorizon = new Date(to.getTime() + 3650 * 86_400_000);
  const [contracts, obligations, milestones] = await Promise.all([
    db.contract.findMany({ where: { AND: [visible, { OR: [{ expirationDate: { gte: from, lt: noticeHorizon } }, { renewalDate: { gte: from, lt: to } }] }] }, select: { id: true, contractNumber: true, title: true, status: true, expirationDate: true, renewalDate: true, noticePeriodDays: true }, take: 2000 }),
    db.contractObligation.findMany({ where: { organizationId: actor.organizationId, status: { in: ["OPEN", "IN_PROGRESS"] }, dueDate: { gte: from, lt: to }, contract: visible }, select: { contractId: true, title: true, dueDate: true, status: true, contract: { select: { contractNumber: true } } }, take: 2000 }),
    db.contractMilestone.findMany({ where: { organizationId: actor.organizationId, status: "PLANNED", dueDate: { gte: from, lt: to }, contract: visible }, select: { contractId: true, title: true, dueDate: true, status: true, contract: { select: { contractNumber: true } } }, take: 2000 }),
  ]);
  return buildCalendarEvents({
    contracts,
    obligations: obligations.map((row) => ({ ...row, contractNumber: row.contract.contractNumber })),
    milestones: milestones.map((row) => ({ ...row, contractNumber: row.contract.contractNumber })),
  }, from, to);
}
