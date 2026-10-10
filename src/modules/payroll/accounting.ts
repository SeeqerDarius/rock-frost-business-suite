import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { postPayrollRunAccrual } from "@/lib/accounting-integration";

export async function postPayrollRunAccounting(
  organizationId: string,
  run: { id: string; periodStart: Date; periodEnd: Date; payDate: Date; payslips: { grossPay: Prisma.Decimal; netPay: Prisma.Decimal; taxDeduction: Prisma.Decimal }[] },
  actorId?: string | null,
) {
  const totals = run.payslips.reduce(
    (sum, slip) => ({ gross: sum.gross.plus(slip.grossPay), net: sum.net.plus(slip.netPay), deductions: sum.deductions.plus(slip.taxDeduction) }),
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
  await db.payrollRun.updateMany({
    where: { id: run.id, organizationId, status: "COMPLETED" },
    data: { postingStatus: result.posted ? "POSTED" : result.reason === "accounting-not-enabled" ? "NOT_REQUIRED" : "FAILED" },
  });
  return result;
}
