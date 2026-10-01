import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as hr from "@/modules/hr/service";
import * as payroll from "@/modules/payroll/service";
import * as school from "@/modules/school/service";
import { postPayrollRunAccounting } from "@/modules/payroll/accounting";
import { cleanupTestOrg, createTestOrg, type TestOrg } from "./setup/fixtures";
import { testDb } from "./setup/db";

let orgA: TestOrg;
let orgB: TestOrg;
let employeeA: Awaited<ReturnType<typeof hr.createEmployee>>;
let employeeB: Awaited<ReturnType<typeof hr.createEmployee>>;

beforeAll(async () => {
  orgA = await createTestOrg("school-payroll-a");
  orgB = await createTestOrg("school-payroll-b");
  employeeA = await hr.createEmployee(orgA.organizationId, { fullName: "School Employee A", hireDate: new Date("2025-01-01") });
  employeeB = await hr.createEmployee(orgB.organizationId, { fullName: "School Employee B", hireDate: new Date("2025-01-01") });
  await hr.activateEmployee(orgA.organizationId, employeeA.id);
  await hr.activateEmployee(orgB.organizationId, employeeB.id);
  await payroll.setCompensation(orgA.organizationId, { employeeId: employeeA.id, baseSalary: "1000.05", effectiveDate: new Date("2026-01-01") });
  await payroll.setCompensation(orgB.organizationId, { employeeId: employeeB.id, baseSalary: "2000.00", effectiveDate: new Date("2026-01-01") });
  await payroll.updateSettings(orgA.organizationId, "0.10", false);
});

afterAll(async () => {
  await cleanupTestOrg(orgA);
  await cleanupTestOrg(orgB);
});

describe("School payroll inputs integrate with Payroll runs", () => {
  it("rejects foreign HR employees and calculates linked earnings and deductions into payslips", async () => {
    await expect(school.createSchoolPayrollAdjustment(orgA.organizationId, {
      employeeId: employeeB.id,
      period: "2026-01",
      type: "Teaching allowance",
      category: "EARNING",
      description: "Foreign employee allowance",
      amount: "10.00",
    })).rejects.toThrow(school.SchoolNotFoundError);

    const earning = await school.createSchoolPayrollAdjustment(orgA.organizationId, {
      employeeId: employeeA.id,
      period: "2026-01",
      type: "Teaching allowance",
      category: "EARNING",
      description: "Teaching allowance",
      amount: "150.00",
    });
    const deduction = await school.createSchoolPayrollAdjustment(orgA.organizationId, {
      employeeId: employeeA.id,
      period: "2026-01",
      type: "Other",
      category: "DEDUCTION",
      description: "Staff loan repayment",
      amount: "50.00",
    });
    const run = await payroll.createRun(orgA.organizationId, {
      periodStart: new Date("2026-01-01T00:00:00.000Z"),
      periodEnd: new Date("2026-01-31T00:00:00.000Z"),
      payDate: new Date("2026-02-01T00:00:00.000Z"),
    });

    await payroll.processRun(orgA.organizationId, run.id);

    const payslip = await testDb.payrollPayslip.findFirstOrThrow({ where: { organizationId: orgA.organizationId, payrollRunId: run.id, employeeId: employeeA.id } });
    expect(Number(payslip.grossPay)).toBe(1150.05);
    expect(Number(payslip.taxDeduction)).toBe(115.01);
    expect(Number(payslip.otherDeductions)).toBe(50);
    expect(Number(payslip.netPay)).toBe(985.04);
    expect(Number(payslip.grossPay) - Number(payslip.taxDeduction) - Number(payslip.otherDeductions)).toBeCloseTo(Number(payslip.netPay), 2);
    const savedInputs = await testDb.schoolPayrollAdjustment.findMany({ where: { id: { in: [earning.id, deduction.id] }, organizationId: orgA.organizationId } });
    expect(savedInputs.every((input) => input.payrollRunId === run.id && input.processedAt !== null)).toBe(true);

    const retryable = await payroll.getPayrollRunForPostingRetry(orgA.organizationId, run.id);
    await expect(postPayrollRunAccounting(orgA.organizationId, retryable!, orgA.userId)).resolves.toMatchObject({ posted: true });
    const journal = await testDb.accountingJournalEntry.findFirstOrThrow({ where: { organizationId: orgA.organizationId, sourceType: "PAYROLL_RUN", sourceId: run.id, postingPurpose: "COMPLETED_ACCRUAL" }, include: { lines: true } });
    expect(journal.lines.reduce((sum, line) => sum + Number(line.debit), 0)).toBeCloseTo(1150.05, 2);
    expect(journal.lines.reduce((sum, line) => sum + Number(line.credit), 0)).toBeCloseTo(1150.05, 2);
  });

  it("blocks unlinked legacy inputs without completing the run, then allows a tenant-scoped link and retry", async () => {
    const legacy = await testDb.schoolPayrollAdjustment.create({
      data: {
        organizationId: orgA.organizationId,
        employeeId: null,
        legacyEmployeeId: "old-unverified-employee-id",
        period: "2026-02",
        type: "Teaching allowance",
        category: "EARNING",
        description: "Imported historical input",
        amount: "75.00",
      },
    });
    const run = await payroll.createRun(orgA.organizationId, {
      periodStart: new Date("2026-02-01T00:00:00.000Z"),
      periodEnd: new Date("2026-02-28T00:00:00.000Z"),
      payDate: new Date("2026-03-01T00:00:00.000Z"),
    });

    await expect(payroll.processRun(orgA.organizationId, run.id)).rejects.toMatchObject({ reason: "unlinked" });
    await expect(school.assignPendingSchoolPayrollEmployee(orgA.organizationId, legacy.id, employeeB.id)).rejects.toThrow(school.SchoolNotFoundError);
    expect((await testDb.payrollRun.findUniqueOrThrow({ where: { id: run.id } })).status).toBe("DRAFT");

    await school.assignPendingSchoolPayrollEmployee(orgA.organizationId, legacy.id, employeeA.id);
    await payroll.processRun(orgA.organizationId, run.id);

    const saved = await testDb.schoolPayrollAdjustment.findFirstOrThrow({ where: { id: legacy.id, organizationId: orgA.organizationId } });
    expect(saved).toMatchObject({ employeeId: employeeA.id, legacyEmployeeId: null, payrollRunId: run.id });
  });

  it("requires a full calendar month when a matching School input is pending", async () => {
    await school.createSchoolPayrollAdjustment(orgA.organizationId, {
      employeeId: employeeA.id,
      period: "2026-03",
      type: "Substitute cover",
      category: "EARNING",
      description: "Substitute cover",
      amount: "40.00",
    });
    const run = await payroll.createRun(orgA.organizationId, {
      periodStart: new Date("2026-03-01T00:00:00.000Z"),
      periodEnd: new Date("2026-03-15T00:00:00.000Z"),
      payDate: new Date("2026-03-16T00:00:00.000Z"),
    });

    await expect(payroll.processRun(orgA.organizationId, run.id)).rejects.toMatchObject({ reason: "period-mismatch" });
    expect((await testDb.payrollRun.findUniqueOrThrow({ where: { id: run.id } })).status).toBe("DRAFT");
  });

  it("rejects deductions that would make take-home pay negative without consuming the input", async () => {
    const deduction = await school.createSchoolPayrollAdjustment(orgA.organizationId, {
      employeeId: employeeA.id,
      period: "2026-04",
      type: "Other",
      category: "DEDUCTION",
      description: "Excess deduction",
      amount: "1000.00",
    });
    const run = await payroll.createRun(orgA.organizationId, {
      periodStart: new Date("2026-04-01T00:00:00.000Z"),
      periodEnd: new Date("2026-04-30T00:00:00.000Z"),
      payDate: new Date("2026-05-01T00:00:00.000Z"),
    });

    await expect(payroll.processRun(orgA.organizationId, run.id)).rejects.toMatchObject({ reason: "deductions-exceed-net" });

    const [savedRun, savedDeduction] = await Promise.all([
      testDb.payrollRun.findUniqueOrThrow({ where: { id: run.id } }),
      testDb.schoolPayrollAdjustment.findFirstOrThrow({ where: { id: deduction.id, organizationId: orgA.organizationId } }),
    ]);
    expect(savedRun.status).toBe("DRAFT");
    expect(savedDeduction.payrollRunId).toBeNull();
    expect(savedDeduction.processedAt).toBeNull();
  });
});
