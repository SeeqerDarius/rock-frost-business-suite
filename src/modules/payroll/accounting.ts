import "server-only";

import { Prisma, type PayrollPayslip, type PayrollPayslipDeduction, type PayrollRun } from "@prisma/client";
import { db } from "@/lib/db";
import { postPayrollRunAccrual, type PostModuleRevenueResult } from "@/lib/accounting-integration";

export type PayrollRunWithPayslips = PayrollRun & { payslips: (PayrollPayslip & { deductions?: PayrollPayslipDeduction[] })[] };

/**
 * Statutory deduction lines by account: employee deductions and employer
 * contributions credit their own liability accounts, and employer
 * contributions debit their expense accounts.
 */
export function statutoryPostingComponents(run: PayrollRunWithPayslips) {
  const liabilities = new Map<string, Prisma.Decimal>();
  const employerExpenses = new Map<string, Prisma.Decimal>();
  for (const line of run.payslips.flatMap((payslip) => payslip.deductions ?? [])) {
    if (new Prisma.Decimal(line.amount).isZero()) continue;
    liabilities.set(line.liabilityAccountCode, (liabilities.get(line.liabilityAccountCode) ?? new Prisma.Decimal(0)).plus(line.amount));
    if (line.kind === "EMPLOYER_CONTRIBUTION" && line.expenseAccountCode) employerExpenses.set(line.expenseAccountCode, (employerExpenses.get(line.expenseAccountCode) ?? new Prisma.Decimal(0)).plus(line.amount));
  }
  const list = (map: Map<string, Prisma.Decimal>) => [...map].map(([accountCode, amount]) => ({ accountCode, amount: amount.toFixed(2) }));
  return { liabilities: list(liabilities), employerExpenses: list(employerExpenses) };
}

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
  const components = statutoryPostingComponents(run);
  const result = await postPayrollRunAccrual(organizationId, {
    runId: run.id,
    payDate: run.payDate,
    grossPay: totals.gross.toFixed(2),
    netPay: totals.net.toFixed(2),
    deductions: totals.deductions.toFixed(2),
    ...(components.liabilities.length ? { statutory: components } : {}),
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
