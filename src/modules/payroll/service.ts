import "server-only";

import { db } from "@/lib/db";
import { createWithUniqueRetry } from "@/lib/unique-retry";
import { Prisma } from "@prisma/client";
import { sendSms } from "@/lib/sms";
import { payrollPayslipIssuedSms } from "@/lib/sms-templates";
import { formatMoney } from "@/lib/currency";
import { organizationNumberLocale } from "@/lib/org-format";
import { claimSchoolPayrollInputsForRun, listSchoolPayrollInputsForRun } from "@/modules/school/payroll-integration";

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
 * Completed runs accrue their gross salary expense and related liabilities in
 * Accounting through the public integration contract. The source run remains
 * authoritative if delivery is unavailable and exposes a retryable status.
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
    where: { organizationId, status: { in: ["ACTIVE", "ON_LEAVE", "REINSTATED"] }, payrollEligible: true, payrollCompensation: null },
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
  return createWithUniqueRetry(() =>
    db.payrollSettings.upsert({
      where: { organizationId },
      update: {},
      create: { organizationId },
    }),
  );
}

export function updateSettings(organizationId: string, defaultTaxRate: string, smsNotificationsEnabled: boolean) {
  const rate = Number(defaultTaxRate);
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
    throw new InvalidCompensationError("Default tax rate must be between 0% and 100%.");
  }
  return createWithUniqueRetry(() =>
    db.payrollSettings.upsert({
      where: { organizationId },
      update: { defaultTaxRate, smsNotificationsEnabled },
      create: { organizationId, defaultTaxRate, smsNotificationsEnabled },
    }),
  );
}

// --- Runs ---

export function listRuns(organizationId: string) {
  return db.payrollRun.findMany({
    where: { organizationId },
    include: { payslips: true, createdBy: true },
    orderBy: { periodStart: "desc" },
  });
}

export function getPayrollRunForPostingRetry(organizationId: string, runId: string) {
  return db.payrollRun.findFirst({
    where: { id: runId, organizationId, status: "COMPLETED", postingStatus: { in: ["PENDING", "FAILED", "NOT_REQUIRED"] } },
    include: { payslips: true },
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
export class SchoolPayrollInputError extends Error {
  constructor(readonly reason: "unlinked" | "employee-ineligible" | "period-mismatch" | "deductions-exceed-net" | "changed") {
    super(`School payroll inputs need attention: ${reason}`);
  }
}

function monthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function isFullCalendarMonth(periodStart: Date, periodEnd: Date) {
  const start = new Date(Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth(), 1));
  const end = new Date(Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 1, 0));
  return periodStart.toISOString().slice(0, 10) === start.toISOString().slice(0, 10)
    && periodEnd.toISOString().slice(0, 10) === end.toISOString().slice(0, 10);
}

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
  const existingRun = await db.payrollRun.findFirst({ where: { id: runId, organizationId } });
  if (!existingRun) throw new NotFoundError("Payroll run not found.");

  const [settings, compensations] = await Promise.all([
    getSettings(organizationId),
    db.payrollCompensation.findMany({
      where: { organizationId, employee: { status: { in: ["ACTIVE", "ON_LEAVE", "REINSTATED"] }, payrollEligible: true } },
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

  const run = await db.$transaction(async (tx) => {
    const claimed = await tx.payrollRun.updateMany({ where: { id: runId, status: "DRAFT" }, data: { status: "COMPLETED" } });
    if (claimed.count === 0) throw new RunStateError("Only draft runs can be processed.");

    const schoolInputs = await listSchoolPayrollInputsForRun(tx, organizationId, monthKey(existingRun.periodStart), monthKey(existingRun.periodEnd));
    if (schoolInputs.length > 0 && !isFullCalendarMonth(existingRun.periodStart, existingRun.periodEnd)) {
      throw new SchoolPayrollInputError("period-mismatch");
    }

    const compensatedEmployeeIds = new Set(compensations.map((compensation) => compensation.employeeId));
    const adjustmentTotals = new Map<string, { earnings: Prisma.Decimal; deductions: Prisma.Decimal }>();
    for (const input of schoolInputs) {
      if (!input.employeeId || input.legacyEmployeeId) throw new SchoolPayrollInputError("unlinked");
      if (!compensatedEmployeeIds.has(input.employeeId)) throw new SchoolPayrollInputError("employee-ineligible");
      const totals = adjustmentTotals.get(input.employeeId) ?? { earnings: new Prisma.Decimal(0), deductions: new Prisma.Decimal(0) };
      if (input.category === "DEDUCTION") totals.deductions = totals.deductions.plus(input.amount);
      else totals.earnings = totals.earnings.plus(input.amount);
      adjustmentTotals.set(input.employeeId, totals);
    }

    const payslipAmounts = compensations.map((comp) => {
      const adjustment = adjustmentTotals.get(comp.employeeId) ?? { earnings: new Prisma.Decimal(0), deductions: new Prisma.Decimal(0) };
      const grossPay = new Prisma.Decimal(comp.baseSalary).plus(adjustment.earnings);
      const taxDeduction = grossPay.times(taxRate).toDecimalPlaces(2);
      const netPay = grossPay.minus(taxDeduction).minus(adjustment.deductions);
      if (netPay.isNegative()) throw new SchoolPayrollInputError("deductions-exceed-net");
      return { employeeId: comp.employeeId, grossPay, taxDeduction, otherDeductions: adjustment.deductions, netPay };
    });

    try {
      await claimSchoolPayrollInputsForRun(tx, organizationId, schoolInputs.map((input) => input.id), runId);
    } catch {
      throw new SchoolPayrollInputError("changed");
    }

    for (const amounts of payslipAmounts) {
      await tx.payrollPayslip.create({
        data: {
          organizationId,
          payrollRunId: runId,
          employeeId: amounts.employeeId,
          grossPay: amounts.grossPay.toFixed(2),
          taxDeduction: amounts.taxDeduction.toFixed(2),
          otherDeductions: amounts.otherDeductions.toFixed(2),
          netPay: amounts.netPay.toFixed(2),
        },
      });
    }
    return tx.payrollRun.findUniqueOrThrow({ where: { id: runId } });
  });

  // After the transaction commits, never inside it - an SMS failure (or a
  // slow network call held across every payslip) must never roll back or
  // stall a payroll run that has already succeeded.
  if (settings.smsNotificationsEnabled) {
    const [payslips, organization] = await Promise.all([
      db.payrollPayslip.findMany({ where: { payrollRunId: runId }, include: { employee: true } }),
      db.organization.findUnique({ where: { id: organizationId }, select: { currency: true, locale: true, numberFormat: true } }),
    ]);
    await Promise.all(payslips.map((payslip) => {
      const phone = payslip.employee.mobilePhone || payslip.employee.phone;
      if (!phone) return undefined;
      return sendSms({
        to: phone,
        ...payrollPayslipIssuedSms({ employeeName: payslip.employee.fullName, netPay: formatMoney(payslip.netPay, organization?.currency, organizationNumberLocale(organization)), payDate: run.payDate }),
        purpose: "PAYROLL_PAYSLIP_ISSUED",
        organizationId,
        relatedType: "PayrollPayslip",
        relatedId: payslip.id,
      });
    }));
  }

  return run;
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
