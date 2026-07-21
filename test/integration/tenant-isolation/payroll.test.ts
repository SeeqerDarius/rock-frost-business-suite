import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as payroll from "@/modules/payroll/service";
import * as hr from "@/modules/hr/service";
import { createTestOrg, cleanupTestOrg, type TestOrg } from "../setup/fixtures";

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
});
