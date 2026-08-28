import "server-only";

import { Prisma } from "@prisma/client";
import type { AccountingAccountType, AccountingPlanKind, AccountingPlanStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { moduleRegistry } from "@/platform/modules/registry";

const MONEY_ZERO = new Prisma.Decimal(0);

export class AccountingPlanValidationError extends Error {}
export class AccountingPlanStateError extends Error {}
export class AccountingPlanApprovalError extends Error {}

function monthStart(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
}

function monthEnd(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}

function dimensionKey(branchId?: string | null, sourceModule?: string | null) {
  return `branch:${branchId ?? "all"}|module:${sourceModule ?? "all"}`;
}

async function lockPlan(tx: Prisma.TransactionClient, organizationId: string, planId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${organizationId}:accounting-plan:${planId}`}))`;
}

async function requirePlan(tx: Prisma.TransactionClient, organizationId: string, planId: string) {
  const plan = await tx.accountingPlan.findFirst({ where: { id: planId, organizationId } });
  if (!plan) throw new AccountingPlanValidationError("Plan not found.");
  return plan;
}

export async function listAccountingPlans(organizationId: string) {
  return db.accountingPlan.findMany({
    where: { organizationId },
    include: { _count: { select: { lines: true } } },
    orderBy: [{ startDate: "desc" }, { name: "asc" }, { revision: "desc" }],
  });
}

export async function getAccountingPlan(organizationId: string, planId: string) {
  return db.accountingPlan.findFirst({
    where: { id: planId, organizationId },
    include: {
      lines: { include: { account: true, branch: true }, orderBy: [{ periodStart: "asc" }, { account: { code: "asc" } }] },
      decisions: { include: { actor: { select: { name: true, email: true } } }, orderBy: { createdAt: "desc" } },
    },
  });
}

export async function createAccountingPlan(organizationId: string, input: {
  name: string;
  kind: AccountingPlanKind;
  startDate: Date;
  endDate: Date;
  actualThroughDate?: Date | null;
  notes?: string | null;
}, actorId?: string | null) {
  if (input.startDate > input.endDate) throw new AccountingPlanValidationError("Invalid date range.");
  if (input.kind === "FORECAST" && !input.actualThroughDate) throw new AccountingPlanValidationError("Forecasts require an actual-through date.");
  if (input.actualThroughDate && (input.actualThroughDate < input.startDate || input.actualThroughDate > input.endDate)) {
    throw new AccountingPlanValidationError("Actual-through date must be inside the plan range.");
  }
  const organization = await db.organization.findUnique({ where: { id: organizationId }, select: { currency: true } });
  if (!organization) throw new AccountingPlanValidationError("Organization not found.");
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${organizationId}:accounting-plan-name:${input.name.toLowerCase()}`}))`;
    const latest = await tx.accountingPlan.aggregate({ where: { organizationId, name: input.name }, _max: { revision: true } });
    const plan = await tx.accountingPlan.create({ data: {
      organizationId,
      name: input.name,
      kind: input.kind,
      startDate: monthStart(input.startDate),
      endDate: monthEnd(input.endDate),
      currencyCode: organization.currency.toUpperCase(),
      revision: (latest._max.revision ?? 0) + 1,
      actualThroughDate: input.actualThroughDate ?? null,
      notes: input.notes || null,
      createdById: actorId ?? null,
    } });
    await tx.accountingPlanDecision.create({ data: { organizationId, planId: plan.id, action: "CREATED", toStatus: "DRAFT", actorId: actorId ?? null } });
    return plan;
  });
}

export async function upsertAccountingPlanLine(organizationId: string, planId: string, input: {
  accountId: string;
  periodStart: Date;
  amount: Prisma.Decimal.Value;
  branchId?: string | null;
  sourceModule?: string | null;
  notes?: string | null;
}) {
  const amount = new Prisma.Decimal(input.amount);
  if (!amount.isFinite() || amount.isNegative()) throw new AccountingPlanValidationError("Amount must be zero or greater.");
  return db.$transaction(async (tx) => {
    await lockPlan(tx, organizationId, planId);
    const plan = await requirePlan(tx, organizationId, planId);
    if (plan.status !== "DRAFT") throw new AccountingPlanStateError("Only draft plans can be edited.");
    const periodStart = monthStart(input.periodStart);
    const periodEnd = monthEnd(input.periodStart);
    if (periodStart < plan.startDate || periodEnd > plan.endDate) throw new AccountingPlanValidationError("Line month is outside the plan range.");
    const account = await tx.accountingAccount.findFirst({ where: { id: input.accountId, organizationId, active: true }, select: { id: true } });
    if (!account) throw new AccountingPlanValidationError("Account not found.");
    if (input.branchId) {
      const branch = await tx.branch.findFirst({ where: { id: input.branchId, organizationId }, select: { id: true } });
      if (!branch) throw new AccountingPlanValidationError("Branch not found.");
    }
    if (input.sourceModule) {
      if (!moduleRegistry.some((item) => item.key === input.sourceModule)) throw new AccountingPlanValidationError("Unknown source module.");
      const enabled = await tx.organizationModule.findFirst({ where: { organizationId, enabled: true, module: { code: input.sourceModule } }, select: { id: true } });
      if (!enabled) throw new AccountingPlanValidationError("Source module is not enabled.");
    }
    const key = dimensionKey(input.branchId, input.sourceModule);
    return tx.accountingPlanLine.upsert({
      where: { planId_accountId_periodStart_dimensionKey: { planId, accountId: input.accountId, periodStart, dimensionKey: key } },
      create: { organizationId, planId, accountId: input.accountId, periodStart, periodEnd, amount, branchId: input.branchId || null, sourceModule: input.sourceModule || null, dimensionKey: key, notes: input.notes || null },
      update: { amount, notes: input.notes || null },
    });
  });
}

export async function deleteAccountingPlanLine(organizationId: string, planId: string, lineId: string) {
  return db.$transaction(async (tx) => {
    await lockPlan(tx, organizationId, planId);
    const plan = await requirePlan(tx, organizationId, planId);
    if (plan.status !== "DRAFT") throw new AccountingPlanStateError("Only draft plans can be edited.");
    const result = await tx.accountingPlanLine.deleteMany({ where: { id: lineId, planId, organizationId } });
    if (result.count !== 1) throw new AccountingPlanValidationError("Line not found.");
  });
}

type Transition = { from: AccountingPlanStatus[]; to: AccountingPlanStatus; action: "SUBMITTED" | "APPROVED" | "REJECTED" | "LOCKED" | "ARCHIVED" };

async function transitionAccountingPlan(organizationId: string, planId: string, transition: Transition, actorId: string, reason?: string | null) {
  return db.$transaction(async (tx) => {
    await lockPlan(tx, organizationId, planId);
    const plan = await requirePlan(tx, organizationId, planId);
    if (!transition.from.includes(plan.status)) throw new AccountingPlanStateError("Plan status changed. Refresh and try again.");
    if (transition.to === "SUBMITTED") {
      const count = await tx.accountingPlanLine.count({ where: { planId, organizationId } });
      if (count === 0) throw new AccountingPlanValidationError("Add at least one plan line before submission.");
    }
    if (transition.to === "APPROVED" && plan.submittedById === actorId) {
      throw new AccountingPlanApprovalError("The submitter cannot approve the same plan.");
    }
    if (transition.to === "REJECTED" && !reason?.trim()) throw new AccountingPlanValidationError("A rejection reason is required.");
    const now = new Date();
    const stateFields = transition.to === "SUBMITTED" ? { submittedById: actorId, submittedAt: now }
      : transition.to === "APPROVED" ? { approvedById: actorId, approvedAt: now, rejectionReason: null }
      : transition.to === "REJECTED" ? { rejectedById: actorId, rejectedAt: now, rejectionReason: reason!.trim() }
      : transition.to === "LOCKED" ? { lockedById: actorId, lockedAt: now }
      : {};
    const claimed = await tx.accountingPlan.updateMany({ where: { id: planId, organizationId, status: plan.status }, data: { status: transition.to, ...stateFields } });
    if (claimed.count !== 1) throw new AccountingPlanStateError("Plan status changed. Refresh and try again.");
    await tx.accountingPlanDecision.create({ data: { organizationId, planId, action: transition.action, fromStatus: plan.status, toStatus: transition.to, actorId, reason: reason?.trim() || null } });
    return tx.accountingPlan.findUniqueOrThrow({ where: { id: planId } });
  });
}

export const submitAccountingPlan = (organizationId: string, planId: string, actorId: string) => transitionAccountingPlan(organizationId, planId, { from: ["DRAFT", "REJECTED"], to: "SUBMITTED", action: "SUBMITTED" }, actorId);
export const approveAccountingPlan = (organizationId: string, planId: string, actorId: string) => transitionAccountingPlan(organizationId, planId, { from: ["SUBMITTED"], to: "APPROVED", action: "APPROVED" }, actorId);
export const rejectAccountingPlan = (organizationId: string, planId: string, actorId: string, reason: string) => transitionAccountingPlan(organizationId, planId, { from: ["SUBMITTED"], to: "REJECTED", action: "REJECTED" }, actorId, reason);
export const lockAccountingPlan = (organizationId: string, planId: string, actorId: string) => transitionAccountingPlan(organizationId, planId, { from: ["APPROVED"], to: "LOCKED", action: "LOCKED" }, actorId);
export const archiveAccountingPlan = (organizationId: string, planId: string, actorId: string) => transitionAccountingPlan(organizationId, planId, { from: ["APPROVED", "LOCKED", "REJECTED"], to: "ARCHIVED", action: "ARCHIVED" }, actorId);

export async function createAccountingPlanRevision(organizationId: string, planId: string, actorId: string) {
  return db.$transaction(async (tx) => {
    await lockPlan(tx, organizationId, planId);
    const source = await tx.accountingPlan.findFirst({ where: { id: planId, organizationId }, include: { lines: true } });
    if (!source || source.status === "DRAFT" || source.status === "SUBMITTED") throw new AccountingPlanStateError("Only reviewed plans can be revised.");
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${organizationId}:accounting-plan-name:${source.name.toLowerCase()}`}))`;
    const latest = await tx.accountingPlan.aggregate({ where: { organizationId, name: source.name }, _max: { revision: true } });
    const revision = await tx.accountingPlan.create({ data: {
      organizationId,
      name: source.name,
      kind: source.kind,
      startDate: source.startDate,
      endDate: source.endDate,
      currencyCode: source.currencyCode,
      revision: (latest._max.revision ?? source.revision) + 1,
      parentPlanId: source.id,
      actualThroughDate: source.actualThroughDate,
      notes: source.notes,
      createdById: actorId,
    } });
    if (source.lines.length) await tx.accountingPlanLine.createMany({ data: source.lines.map((line) => ({
      organizationId,
      planId: revision.id,
      accountId: line.accountId,
      branchId: line.branchId,
      sourceModule: line.sourceModule,
      dimensionKey: line.dimensionKey,
      periodStart: line.periodStart,
      periodEnd: line.periodEnd,
      amount: line.amount,
      notes: line.notes,
    })) });
    await tx.accountingPlanDecision.create({ data: { organizationId, planId: revision.id, action: "REVISION_CREATED", toStatus: "DRAFT", actorId, reason: `Created from revision ${source.revision}.` } });
    return revision;
  });
}

function actualBalance(type: AccountingAccountType, debit: Prisma.Decimal, credit: Prisma.Decimal) {
  return type === "ASSET" || type === "EXPENSE" ? debit.minus(credit) : credit.minus(debit);
}

export async function getAccountingPlanVariance(organizationId: string, planId: string) {
  const plan = await db.accountingPlan.findFirst({ where: { id: planId, organizationId }, include: { lines: { include: { account: true } } } });
  if (!plan) throw new AccountingPlanValidationError("Plan not found.");
  const entries = await db.accountingJournalEntry.findMany({
    where: { organizationId, status: "POSTED", entryDate: { gte: plan.startDate, lte: plan.endDate } },
    include: { lines: { include: { account: { select: { id: true, type: true } } } } },
  });
  return plan.lines.map((line) => {
    const debitCredit = entries
      .filter((entry) => entry.entryDate >= line.periodStart && entry.entryDate <= line.periodEnd)
      .filter((entry) => !line.branchId || entry.branchId === line.branchId)
      .filter((entry) => !line.sourceModule || entry.sourceModule === line.sourceModule)
      .flatMap((entry) => entry.lines)
      .filter((journalLine) => journalLine.accountId === line.accountId)
      .reduce((total, journalLine) => ({ debit: total.debit.plus(journalLine.debit), credit: total.credit.plus(journalLine.credit) }), { debit: MONEY_ZERO, credit: MONEY_ZERO });
    const actual = actualBalance(line.account.type, debitCredit.debit, debitCredit.credit);
    const variance = actual.minus(line.amount);
    const variancePercent = line.amount.isZero() ? null : variance.dividedBy(line.amount).times(100);
    const favorable = line.account.type === "REVENUE" ? actual.greaterThan(line.amount)
      : line.account.type === "EXPENSE" ? actual.lessThan(line.amount)
      : null;
    return { line, actual, variance, variancePercent, favorable };
  });
}
