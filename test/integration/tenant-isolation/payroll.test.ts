import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as payroll from "@/modules/payroll/service";
import * as hr from "@/modules/hr/service";
import { postPayrollRunAccounting } from "@/modules/payroll/accounting";
import { createTestOrg, cleanupTestOrg, type TestOrg } from "../setup/fixtures";
import { testDb } from "../setup/db";

/**
 * Real-Postgres equivalent of the mocked IDOR coverage for
 * src/modules/payroll/service.ts. Payroll references HR's HrEmployee by id
 * (documented cross-module dependency per docs/MODULE_BOUNDARIES.md), so Org
 * B's fixture employee is created through HR's own createEmployee() rather
 * than a direct testDb.hrEmployee.create() call. setCompensation()'s
 * employeeId check and processRun()'s runId lookup both throw the module's
 * own exported payroll.NotFoundError.
 */

let orgA: TestOrg;
let orgB: TestOrg;

let orgAEmployee: Awaited<ReturnType<typeof hr.createEmployee>>;
let orgBEmployee: Awaited<ReturnType<typeof hr.createEmployee>>;
let orgBRun: Awaited<ReturnType<typeof payroll.createRun>>;

beforeAll(async () => {
  orgA = await createTestOrg("orgA-payroll");
  orgB = await createTestOrg("orgB-payroll");

  orgAEmployee = await hr.createEmployee(orgA.organizationId, { fullName: "Org A Employee", hireDate: new Date("2025-01-01") });
  orgBEmployee = await hr.createEmployee(orgB.organizationId, { fullName: "Org B Employee", hireDate: new Date("2025-01-01") });

  await payroll.setCompensation(orgA.organizationId, {
    employeeId: orgAEmployee.id,
    baseSalary: "1000.00",
    effectiveDate: new Date("2026-01-01"),
  });
  await payroll.setCompensation(orgB.organizationId, {
    employeeId: orgBEmployee.id,
    baseSalary: "2000.00",
    effectiveDate: new Date("2026-01-01"),
  });

  orgBRun = await payroll.createRun(orgB.organizationId, {
    periodStart: new Date("2026-01-01"),
    periodEnd: new Date("2026-01-31"),
    payDate: new Date("2026-02-01"),
  });
});

afterAll(async () => {
  await cleanupTestOrg(orgA);
  await cleanupTestOrg(orgB);
});

describe("Payroll service — cross-tenant isolation against real Postgres", () => {
  it("setCompensation rejects an employeeId from another organization", async () => {
    await expect(
      payroll.setCompensation(orgA.organizationId, {
        employeeId: orgBEmployee.id,
        baseSalary: "1500.00",
        effectiveDate: new Date("2026-01-01"),
      }),
    ).rejects.toThrow(payroll.NotFoundError);
  });

  it("processRun rejects a runId from another organization", async () => {
    await expect(payroll.processRun(orgA.organizationId, orgBRun.id)).rejects.toThrow(payroll.NotFoundError);
  });

  it("listCompensation scoped to Org A never returns Org B's employee compensation", async () => {
    const list = await payroll.listCompensation(orgA.organizationId);
    expect(list.map((c) => c.employeeId)).not.toContain(orgBEmployee.id);
    expect(list.map((c) => c.employeeId)).toContain(orgAEmployee.id);
  });

  it("posts a completed run once to the org ledger and marks it POSTED", async () => {
    const run = await payroll.createRun(orgA.organizationId, {
      periodStart: new Date("2026-03-01"),
      periodEnd: new Date("2026-03-31"),
      payDate: new Date("2026-04-01"),
    });
    await payroll.processRun(orgA.organizationId, run.id);
    const retryable = await payroll.getPayrollRunForPostingRetry(orgA.organizationId, run.id);
    expect(retryable).not.toBeNull();

    await expect(postPayrollRunAccounting(orgA.organizationId, retryable!, orgA.userId)).resolves.toMatchObject({ posted: true });
    await postPayrollRunAccounting(orgA.organizationId, retryable!, orgA.userId);
    const savedRun = await testDb.payrollRun.findFirstOrThrow({ where: { id: run.id, organizationId: orgA.organizationId } });
    expect(savedRun.postingStatus).toBe("POSTED");

    const journals = await testDb.accountingJournalEntry.findMany({ where: { organizationId: orgA.organizationId, sourceType: "PAYROLL_RUN", sourceId: run.id, postingPurpose: "COMPLETED_ACCRUAL" }, include: { lines: true } });
    expect(journals).toHaveLength(1);
    expect(journals[0].lines.reduce((sum, line) => sum + Number(line.debit), 0)).toBeCloseTo(1000, 2);
    expect(journals[0].lines.reduce((sum, line) => sum + Number(line.credit), 0)).toBeCloseTo(1000, 2);
  });

  it("does not allow a caller to fetch a posting retry for another tenant", async () => {
    await payroll.processRun(orgB.organizationId, orgBRun.id);
    await expect(payroll.getPayrollRunForPostingRetry(orgA.organizationId, orgBRun.id)).resolves.toBeNull();
  });
});
