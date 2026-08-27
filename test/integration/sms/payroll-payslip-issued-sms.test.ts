import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { testDb } from "../setup/db";
import { createTestOrg, cleanupTestOrg, type TestOrg } from "../setup/fixtures";
import * as payroll from "@/modules/payroll/service";
import * as hr from "@/modules/hr/service";

/**
 * Real-Postgres proof for Phase 3's Payroll trigger: processRun() sends one
 * SMS per payslip after its transaction commits, gated on
 * PayrollSettings.smsNotificationsEnabled. Only the network call to mNotify
 * is mocked; the settings read, the post-commit payslip+employee join, and
 * the SmsMessage writes are real.
 */

let org: TestOrg;

beforeAll(async () => {
  org = await createTestOrg("payroll-sms");
});

afterAll(async () => {
  await cleanupTestOrg(org);
});

beforeEach(() => {
  process.env.MNOTIFY_API_KEY = "test-key";
  process.env.MNOTIFY_SENDER_ID = "RockFrost";
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "success" }) }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function newRunFor(employeeLabel: string, phoneField: "mobilePhone" | "phone" | "none") {
  const employee = await hr.createEmployee(org.organizationId, {
    fullName: employeeLabel,
    hireDate: new Date("2025-01-01"),
    mobilePhone: phoneField === "mobilePhone" ? "0241234567" : undefined,
    phone: phoneField === "phone" ? "0201234567" : undefined,
  });
  await hr.activateEmployee(org.organizationId, employee.id);
  await payroll.setCompensation(org.organizationId, { employeeId: employee.id, baseSalary: "1000.00", effectiveDate: new Date("2026-01-01") });
  const run = await payroll.createRun(org.organizationId, { periodStart: new Date("2026-01-01"), periodEnd: new Date("2026-01-31"), payDate: new Date("2026-02-01") });
  return { employee, run };
}

describe("Payroll payslip-issued SMS (real Postgres)", () => {
  it("sends and logs an SMS per payslip when the setting is on, preferring mobilePhone over phone", async () => {
    await payroll.updateSettings(org.organizationId, "0", true);
    const { employee, run } = await newRunFor("Ama Mensah", "mobilePhone");

    await payroll.processRun(org.organizationId, run.id);

    const payslip = await testDb.payrollPayslip.findFirstOrThrow({ where: { organizationId: org.organizationId, payrollRunId: run.id, employeeId: employee.id } });
    const row = await testDb.smsMessage.findFirst({ where: { organizationId: org.organizationId, purpose: "PAYROLL_PAYSLIP_ISSUED", relatedId: payslip.id } });
    expect(row).toMatchObject({ to: "0241234567", status: "SENT", relatedType: "PayrollPayslip" });
  });

  it("falls back to the general phone field when mobilePhone is absent", async () => {
    await payroll.updateSettings(org.organizationId, "0", true);
    const { employee, run } = await newRunFor("Kofi Owusu", "phone");

    await payroll.processRun(org.organizationId, run.id);

    const payslip = await testDb.payrollPayslip.findFirstOrThrow({ where: { organizationId: org.organizationId, payrollRunId: run.id, employeeId: employee.id } });
    const row = await testDb.smsMessage.findFirst({ where: { organizationId: org.organizationId, purpose: "PAYROLL_PAYSLIP_ISSUED", relatedId: payslip.id } });
    expect(row).toMatchObject({ to: "0201234567", status: "SENT" });
  });

  it("does not send when the setting is off", async () => {
    await payroll.updateSettings(org.organizationId, "0", false);
    const { employee, run } = await newRunFor("No SMS", "mobilePhone");

    await payroll.processRun(org.organizationId, run.id);

    const payslip = await testDb.payrollPayslip.findFirstOrThrow({ where: { organizationId: org.organizationId, payrollRunId: run.id, employeeId: employee.id } });
    const row = await testDb.smsMessage.findFirst({ where: { organizationId: org.organizationId, relatedId: payslip.id } });
    expect(row).toBeNull();
  });

  it("does not send for an employee with no phone on file, even with the setting on", async () => {
    await payroll.updateSettings(org.organizationId, "0", true);
    const { employee, run } = await newRunFor("No Phone", "none");

    await payroll.processRun(org.organizationId, run.id);

    const payslip = await testDb.payrollPayslip.findFirstOrThrow({ where: { organizationId: org.organizationId, payrollRunId: run.id, employeeId: employee.id } });
    const row = await testDb.smsMessage.findFirst({ where: { organizationId: org.organizationId, relatedId: payslip.id } });
    expect(row).toBeNull();
  });
});
