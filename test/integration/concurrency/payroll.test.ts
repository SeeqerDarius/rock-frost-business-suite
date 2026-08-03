import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as payroll from "@/modules/payroll/service";
import * as hr from "@/modules/hr/service";
import { testDb } from "../setup/db";
import { createTestOrg, cleanupTestOrg, type TestOrg } from "../setup/fixtures";

/**
 * Real-Postgres concurrency coverage for src/modules/payroll/service.ts
 * (Hardening Pass 4, Milestone B). processRun() claims its run with a
 * guarded `updateMany` (DRAFT -> COMPLETED) as the first statement inside
 * its transaction, before generating any payslips — these tests fire truly
 * concurrent requests via Promise.allSettled and verify the final
 * committed state in Postgres, not just that one promise rejected.
 */

let org: TestOrg;
let employeeA: Awaited<ReturnType<typeof hr.createEmployee>>;
let employeeB: Awaited<ReturnType<typeof hr.createEmployee>>;

beforeAll(async () => {
  org = await createTestOrg("concurrency-payroll");

  employeeA = await hr.createEmployee(org.organizationId, {
    fullName: "Concurrency Employee A",
    hireDate: new Date("2025-01-01"),
  });
  employeeB = await hr.createEmployee(org.organizationId, {
    fullName: "Concurrency Employee B",
    hireDate: new Date("2025-01-01"),
  });

  await hr.activateEmployee(org.organizationId, employeeA.id);
  await hr.activateEmployee(org.organizationId, employeeB.id);

  await payroll.setCompensation(org.organizationId, {
    employeeId: employeeA.id,
    baseSalary: "1000.00",
    effectiveDate: new Date("2026-01-01"),
  });
  await payroll.setCompensation(org.organizationId, {
    employeeId: employeeB.id,
    baseSalary: "2000.00",
    effectiveDate: new Date("2026-01-01"),
  });
});

afterAll(async () => {
  await cleanupTestOrg(org);
});

describe("Payroll service — concurrency against real Postgres", () => {
  it("two simultaneous processRun() calls on the same DRAFT run: exactly one succeeds, no duplicate payslips", async () => {
    const run = await payroll.createRun(org.organizationId, {
      periodStart: new Date("2026-01-01"),
      periodEnd: new Date("2026-01-31"),
      payDate: new Date("2026-02-01"),
    });

    const results = await Promise.allSettled([
      payroll.processRun(org.organizationId, run.id),
      payroll.processRun(org.organizationId, run.id),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(payroll.RunStateError);

    const compensations = await payroll.listCompensation(org.organizationId);
    const payslips = await testDb.payrollPayslip.findMany({
      where: { organizationId: org.organizationId, payrollRunId: run.id },
    });
    // One payslip per compensated employee — never doubled by the loser
    // also having generated a set before its claim would have failed.
    expect(payslips).toHaveLength(compensations.length);
    const employeeIdsWithPayslips = new Set(payslips.map((p) => p.employeeId));
    expect(employeeIdsWithPayslips.size).toBe(payslips.length);
    expect(employeeIdsWithPayslips.has(employeeA.id)).toBe(true);
    expect(employeeIdsWithPayslips.has(employeeB.id)).toBe(true);

    const finalRun = await testDb.payrollRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(finalRun.status).toBe("COMPLETED");
  });

  it("processRun() racing cancelRun() on the same DRAFT run resolves coherently: exactly one applies", async () => {
    const run = await payroll.createRun(org.organizationId, {
      periodStart: new Date("2026-02-01"),
      periodEnd: new Date("2026-02-28"),
      payDate: new Date("2026-03-01"),
    });

    const [processResult, cancelResult] = await Promise.allSettled([
      payroll.processRun(org.organizationId, run.id),
      payroll.cancelRun(org.organizationId, run.id),
    ]);

    const statuses = [processResult.status, cancelResult.status];
    expect(statuses.filter((s) => s === "fulfilled")).toHaveLength(1);
    expect(statuses.filter((s) => s === "rejected")).toHaveLength(1);

    const finalRun = await testDb.payrollRun.findUniqueOrThrow({ where: { id: run.id } });
    const payslips = await testDb.payrollPayslip.findMany({
      where: { organizationId: org.organizationId, payrollRunId: run.id },
    });

    if (processResult.status === "fulfilled") {
      // processRun's atomic claim won: cancelRun must have lost the race
      // and found the run no longer DRAFT.
      expect(cancelResult.status).toBe("rejected");
      if (cancelResult.status === "rejected") {
        expect(cancelResult.reason).toBeInstanceOf(payroll.RunStateError);
      }
      expect(finalRun.status).toBe("COMPLETED");
      const compensations = await payroll.listCompensation(org.organizationId);
      expect(payslips).toHaveLength(compensations.length);
    } else {
      // cancelRun's atomic claim won: processRun must have lost the race
      // and found the run no longer DRAFT — and, critically, never created
      // any payslips despite losing after starting its own work.
      expect(processResult.status).toBe("rejected");
      if (processResult.status === "rejected") {
        expect(processResult.reason).toBeInstanceOf(payroll.RunStateError);
      }
      expect(finalRun.status).toBe("CANCELLED");
      expect(payslips).toHaveLength(0);
    }
  });
});
