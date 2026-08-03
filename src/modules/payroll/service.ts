import "server-only";

import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

/**
 * Fresh module (no reference implementation to migrate from). Every function
 * takes organizationId explicitly and filters on it, per docs/MODULE_BOUNDARIES.md.
 *
 * References HrEmployee by id (Payroll is inherently about paying an
 * organization's employees) but owns its own compensation/run/payslip data —
 * it does not modify HrEmployee itself, matching the pattern established by
 * every other module that references another module's core entity by id
 * (e.g. CRM referencing User for ownership).
 *
 * Deliberately NOT integrated with Accounting in this pass (no journal entry
 * posted when a run completes) — see docs/DECISIONS.md / OPERATOR_HANDOFF.md
 * for the reasoning, matching the same scope decision already made for
 * Procurement-to-Accounting.
 */

// --- Compensation ---

export function listCompensation(organizationId: string) {
  return db.payrollCompensation.findMany({
    where: { organizationId },
    include: { employee: true },
    orderBy: { employee: { fullName: "asc" } },
  });
}

export function listEmployeesWithoutCompensation(organizationId: string) {
  return db.hrEmployee.findMany({
    where: { organizationId, status: { in: ["ACTIVE", "ON_LEAVE"] }, payrollCompensation: null },
    orderBy: { fullName: "asc" },
  });
}

interface CompensationInput {
  employeeId: string;
  baseSalary: string;
  payFrequency?: string;
  effectiveDate: Date;
}

/** Thrown when a caller-supplied id doesn't resolve inside the calling organization. */
export class NotFoundError extends Error {}
export class InvalidCompensationError extends Error {}

export async function setCompensation(organizationId: string, data: CompensationInput) {
  const salary = Number(data.baseSalary);
  if (!Number.isFinite(salary) || salary <= 0) {
    throw new InvalidCompensationError("Base salary must be a positive number.");
  }

  const employee = await db.hrEmployee.findFirst({ where: { id: data.employeeId, organizationId } });
  if (!employee) throw new NotFoundError("Employee not found.");

  return db.payrollCompensation.upsert({
    where: { employeeId: data.employeeId },
    update: { baseSalary: data.baseSalary, payFrequency: data.payFrequency ?? "MONTHLY", effectiveDate: data.effectiveDate },
    create: { organizationId, ...data, payFrequency: data.payFrequency ?? "MONTHLY" },
  });
}

// --- Settings ---

export async function getSettings(organizationId: string) {
  return db.payrollSettings.upsert({
    where: { organizationId },
    update: {},
    create: { organizationId },
  });
}

export function updateSettings(organizationId: string, defaultTaxRate: string) {
  const rate = Number(defaultTaxRate);
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
    throw new InvalidCompensationError("Default tax rate must be between 0% and 100%.");
  }
  return db.payrollSettings.upsert({
    where: { organizationId },
    update: { defaultTaxRate },
    create: { organizationId, defaultTaxRate },
  });
}

// --- Runs ---

export function listRuns(organizationId: string) {
  return db.payrollRun.findMany({
    where: { organizationId },
    include: { payslips: true, createdBy: true },
    orderBy: { periodStart: "desc" },
  });
}

interface RunInput {
  periodStart: Date;
  periodEnd: Date;
  payDate: Date;
  createdById?: string | null;
}

export function createRun(organizationId: string, data: RunInput) {
  return db.payrollRun.create({ data: { organizationId, ...data } });
}

export class RunStateError extends Error {}
export class NoCompensationError extends Error {}

/**
 * Claims the run (DRAFT -> COMPLETED) with a guarded updateMany as the
 * first statement inside the transaction — two concurrent "process" clicks
 * on the same draft run previously could both pass a stale status check and
 * both generate a full set of payslips before either commit. Now the second
 * caller's claim matches zero rows and throws before creating anything.
 * Every payslip creation shares this same transaction, so a failure partway
 * through rolls back the claim too, rather than leaving the run COMPLETED
 * with only some employees paid.
 */
export async function processRun(organizationId: string, runId: string) {
  const run = await db.payrollRun.findFirst({ where: { id: runId, organizationId } });
  if (!run) throw new NotFoundError("Payroll run not found.");

  const [settings, compensations] = await Promise.all([
    getSettings(organizationId),
    db.payrollCompensation.findMany({
      where: { organizationId, employee: { status: { in: ["ACTIVE", "ON_LEAVE"] } } },
    }),
  ]);

  if (compensations.length === 0) {
    throw new NoCompensationError("No active employees have compensation set up.");
  }

  // Prisma.Decimal (arbitrary-precision) rather than JS Number arithmetic —
  // grossPay/taxDeduction/netPay are derived values written straight to the
  // database, so any float rounding error here would be a real, persisted
  // discrepancy rather than a transient display artifact.
  const taxRate = new Prisma.Decimal(settings.defaultTaxRate);

  return db.$transaction(async (tx) => {
    const claimed = await tx.payrollRun.updateMany({ where: { id: runId, status: "DRAFT" }, data: { status: "COMPLETED" } });
    if (claimed.count === 0) throw new RunStateError("Only draft runs can be processed.");

    for (const comp of compensations) {
      const grossPay = new Prisma.Decimal(comp.baseSalary);
      const taxDeduction = grossPay.times(taxRate);
      const netPay = grossPay.minus(taxDeduction);
      await tx.payrollPayslip.create({
        data: {
          organizationId,
          payrollRunId: runId,
          employeeId: comp.employeeId,
          grossPay: grossPay.toFixed(2),
          taxDeduction: taxDeduction.toFixed(2),
          netPay: netPay.toFixed(2),
        },
      });
    }
    return tx.payrollRun.findUniqueOrThrow({ where: { id: runId } });
  });
}

export async function cancelRun(organizationId: string, runId: string) {
  const run = await db.payrollRun.findFirst({ where: { id: runId, organizationId } });
  if (!run) throw new NotFoundError("Payroll run not found.");
  const claimed = await db.payrollRun.updateMany({ where: { id: runId, status: "DRAFT" }, data: { status: "CANCELLED" } });
  if (claimed.count === 0) throw new RunStateError("Only draft runs can be cancelled.");
  return db.payrollRun.findUniqueOrThrow({ where: { id: runId } });
}

// --- Payslips ---

export function listPayslips(organizationId: string, runId?: string) {
  return db.payrollPayslip.findMany({
    where: { organizationId, ...(runId ? { payrollRunId: runId } : {}) },
    include: { employee: true, payrollRun: true },
    orderBy: { createdAt: "desc" },
  });
}

// --- Reports ---

export async function getPayrollSummary(organizationId: string) {
  const [compensationCount, employeesWithoutComp, runs, lastCompleted] = await Promise.all([
    db.payrollCompensation.count({ where: { organizationId } }),
    listEmployeesWithoutCompensation(organizationId),
    db.payrollRun.findMany({ where: { organizationId } }),
    db.payrollRun.findFirst({
      where: { organizationId, status: "COMPLETED" },
      orderBy: { payDate: "desc" },
      include: { payslips: true },
    }),
  ]);

  const lastRunTotalNet = lastCompleted?.payslips.reduce((sum, p) => sum + Number(p.netPay), 0) ?? 0;
  const lastRunTotalGross = lastCompleted?.payslips.reduce((sum, p) => sum + Number(p.grossPay), 0) ?? 0;

  return {
    employeesWithCompensationCount: compensationCount,
    employeesWithoutCompensationCount: employeesWithoutComp.length,
    draftRunCount: runs.filter((r) => r.status === "DRAFT").length,
    completedRunCount: runs.filter((r) => r.status === "COMPLETED").length,
    lastCompletedRunPayDate: lastCompleted?.payDate ?? null,
    lastRunTotalGross,
    lastRunTotalNet,
  };
}
