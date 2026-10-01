import "server-only";

import type { SchoolPayrollAdjustmentCategory, Prisma } from "@prisma/client";

/**
 * Public Payroll integration contract owned by School. Payroll calls these
 * functions inside its processing transaction instead of querying School
 * tables directly. Only unprocessed adjustments for the same organization
 * are returned or claimed.
 */
export async function listSchoolPayrollInputsForRun(
  tx: Prisma.TransactionClient,
  organizationId: string,
  firstPeriod: string,
  lastPeriod: string,
) {
  return tx.schoolPayrollAdjustment.findMany({
    where: { organizationId, period: { gte: firstPeriod, lte: lastPeriod }, processedAt: null, payrollRunId: null },
    orderBy: [{ period: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: { id: true, employeeId: true, legacyEmployeeId: true, category: true, amount: true, period: true },
  });
}

export async function claimSchoolPayrollInputsForRun(
  tx: Prisma.TransactionClient,
  organizationId: string,
  adjustmentIds: string[],
  payrollRunId: string,
  processedAt = new Date(),
) {
  if (adjustmentIds.length === 0) return;
  const result = await tx.schoolPayrollAdjustment.updateMany({
    where: { id: { in: adjustmentIds }, organizationId, processedAt: null, payrollRunId: null },
    data: { payrollRunId, processedAt },
  });
  if (result.count !== adjustmentIds.length) throw new Error("School payroll inputs changed while the Payroll run was being processed.");
}

export type SchoolPayrollInput = {
  id: string;
  employeeId: string | null;
  legacyEmployeeId: string | null;
  category: SchoolPayrollAdjustmentCategory;
  amount: Prisma.Decimal;
  period: string;
};
