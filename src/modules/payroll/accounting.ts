import "server-only";

import { Prisma, type PayrollPayslip, type PayrollRun } from "@prisma/client";
import { db } from "@/lib/db";
import { postPayrollRunAccrual, type PostModuleRevenueResult } from "@/lib/accounting-integration";

export type PayrollRunWithPayslips = PayrollRun & { payslips: PayrollPayslip[] };

export async function postPayrollRunAccounting(
  organizationId: string,
  run: PayrollRunWithPayslips,
  actorId?: string | null,
): Promise<PostModuleRevenueResult> {
  const totals = run.payslips.reduce(
    (sum, payslip) => ({
      gross: sum.gross.plus(payslip.grossPay),
      net: sum.net.plus(payslip.netPay),
      deductions: sum.deductions.plus(payslip.taxDeduction).plus(payslip.otherDeductions),
    }),
    { gross: new Prisma.Decimal(0), net: new Prisma.Decimal(0), deductions: new Prisma.Decimal(0) },
  );
  const result = await postPayrollRunAccrual(organizationId, {
    runId: run.id,
    payDate: run.payDate,
    grossPay: totals.gross.toFixed(2),
    netPay: totals.net.toFixed(2),
    deductions: totals.deductions.toFixed(2),
    description: `Payroll accrual for ${run.periodStart.toISOString().slice(0, 10)} to ${run.periodEnd.toISOString().slice(0, 10)}`,
    actorId,
  });
  const postingStatus = result.posted
    ? "POSTED"
    : result.reason === "accounting-not-enabled"
      ? "NOT_REQUIRED"
      : "FAILED";
  await db.payrollRun.updateMany({
    where: { id: run.id, organizationId, status: "COMPLETED" },
    data: { postingStatus },
  });
  return result;
}
