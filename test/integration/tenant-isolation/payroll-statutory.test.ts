import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import * as payroll from "@/modules/payroll/service";
import * as hr from "@/modules/hr/service";
import { postPayrollRunAccounting } from "@/modules/payroll/accounting";
import { applyUsFederalTemplate, confirmDeductionRule, PayrollDeductionError, setDeductionMode, updateDeductionRule, type RuleWriteInput } from "@/modules/payroll/deduction-rules";
import { bracketsFromText } from "@/modules/payroll/statutory";
import { testDb } from "../setup/db";
import { cleanupTestOrg, createTestOrg, type TestOrg } from "../setup/fixtures";

// Wage bases, brackets, and the state rate below are test fixtures, not
// statutory figures; the template's own statutory rates are used as created.
let us: TestOrg;
let other: TestOrg;
let alice: Awaited<ReturnType<typeof hr.createEmployee>>;
let bob: Awaited<ReturnType<typeof hr.createEmployee>>;

const rule = (code: string) => testDb.payrollDeductionRule.findFirstOrThrow({ where: { organizationId: us.organizationId, code, taxYear: 2026 } });
async function edit(code: string, changes: Partial<RuleWriteInput>) {
  const current = await rule(code);
  return updateDeductionRule(us.organizationId, us.userId, current.id, {
    code: current.code, name: current.name, kind: current.kind, method: current.method, taxYear: current.taxYear,
    rate: current.rate?.toString() ?? null, brackets: (current.brackets as RuleWriteInput["brackets"]) ?? null, annualAllowance: current.annualAllowance?.toString() ?? null,
    wageBase: current.wageBase?.toString() ?? null, wageFloor: current.wageFloor?.toString() ?? null, filingStatus: current.filingStatus,
    liabilityAccountCode: current.liabilityAccountCode, expenseAccountCode: current.expenseAccountCode, sourceReference: current.sourceReference, sortOrder: current.sortOrder,
    ...changes,
  });
}
async function confirmAll() {
  for (const item of await testDb.payrollDeductionRule.findMany({ where: { organizationId: us.organizationId, taxYear: 2026, active: true, confirmedAt: null } })) {
    await confirmDeductionRule(us.organizationId, us.userId, item.id, true);
  }
}
async function processMonth(month: number) {
  const last = new Date(Date.UTC(2026, month, 0)).getUTCDate();
  const run = await payroll.createRun(us.organizationId, { periodStart: new Date(Date.UTC(2026, month - 1, 1)), periodEnd: new Date(Date.UTC(2026, month - 1, last)), payDate: new Date(Date.UTC(2026, month - 1, last)) });
  await payroll.processRun(us.organizationId, run.id);
  return run;
}
const slipFor = (runId: string, employeeId: string) => testDb.payrollPayslip.findFirstOrThrow({ where: { organizationId: us.organizationId, payrollRunId: runId, employeeId }, include: { deductions: true } });
const line = (slip: Awaited<ReturnType<typeof slipFor>>, code: string) => slip.deductions.find((d) => d.code === code)!.amount.toFixed(2);

beforeAll(async () => {
  us = await createTestOrg("payroll-statutory-us");
  other = await createTestOrg("payroll-statutory-other");
  await testDb.organization.update({ where: { id: us.organizationId }, data: { currency: "USD", country: "US", jurisdictionCode: "US" } });
  alice = await hr.createEmployee(us.organizationId, { fullName: "Alice Example", hireDate: new Date("2025-01-01") });
  bob = await hr.createEmployee(us.organizationId, { fullName: "Bob Example", hireDate: new Date("2025-01-01") });
  await hr.activateEmployee(us.organizationId, alice.id);
  await hr.activateEmployee(us.organizationId, bob.id);
  await payroll.setCompensation(us.organizationId, { employeeId: alice.id, baseSalary: "10000.00", effectiveDate: new Date("2026-01-01"), filingStatus: "SINGLE" });
  await payroll.setCompensation(us.organizationId, { employeeId: bob.id, baseSalary: "3000.00", effectiveDate: new Date("2026-01-01"), filingStatus: "MARRIED_JOINTLY", additionalWithholding: "50.00" });
}, 120_000);

afterAll(async () => {
  await cleanupTestOrg(us);
  await cleanupTestOrg(other);
});

describe("payroll statutory deductions (real Postgres)", () => {
  it("creates the US federal template unconfirmed, with its accounts, idempotently", async () => {
    await setDeductionMode(us.organizationId, us.userId, "RULES");
    expect(await applyUsFederalTemplate(us.organizationId, us.userId, 2026)).toMatchObject({ rulesCreated: 10 });
    expect(await applyUsFederalTemplate(us.organizationId, us.userId, 2026)).toMatchObject({ rulesCreated: 0 });
    expect(await testDb.accountingAccount.count({ where: { organizationId: us.organizationId, code: { in: ["2210", "2211", "2212", "2213", "2214", "2215", "2216", "6100"] } } })).toBe(8);
    expect(await rule("US-SS-EE")).toMatchObject({ confirmedAt: null, wageBase: null });
    expect((await rule("US-FUTA")).wageBase?.toString()).toBe("7000");
  });

  it("refuses to confirm a rule without its yearly figures, and refuses to run with unconfirmed rules", async () => {
    await expect(confirmDeductionRule(us.organizationId, us.userId, (await rule("US-SS-EE")).id, true)).rejects.toThrow(/wage base/);
    await expect(confirmDeductionRule(us.organizationId, us.userId, (await rule("US-FIT-SINGLE")).id, true)).rejects.toThrow(/bracket/);
    await expect(confirmDeductionRule(us.organizationId, us.userId, (await rule("US-MED-EE")).id, false)).rejects.toThrow(/Confirm that you checked/);
    const run = await payroll.createRun(us.organizationId, { periodStart: new Date("2026-01-01"), periodEnd: new Date("2026-01-31"), payDate: new Date("2026-01-31") });
    await expect(payroll.processRun(us.organizationId, run.id)).rejects.toThrow(/Confirm these 2026 deduction rules/);
    expect((await testDb.payrollRun.findFirstOrThrow({ where: { id: run.id } })).status).toBe("DRAFT");
    await testDb.payrollRun.delete({ where: { id: run.id } });
  });

  it("calculates withholding, contributions with wage caps, and employer taxes, and posts one balanced journal", async () => {
    await edit("US-FIT-SINGLE", { brackets: bracketsFromText("0: 0\n10000: 10\n50000: 20") });
    await edit("US-FIT-MFJ", { brackets: bracketsFromText("0: 0\n20000: 10") });
    await edit("US-FIT-HOH", { brackets: bracketsFromText("0: 0\n15000: 10") });
    await edit("US-SS-EE", { wageBase: "15000" });
    await edit("US-SS-ER", { wageBase: "15000" });
    await edit("US-SUTA", { rate: "2.7", wageBase: "9000" });
    await confirmAll();

    const january = await processMonth(1);
    const a = await slipFor(january.id, alice.id);
    expect(a.taxDeduction.toFixed(2)).toBe("1500.00"); // (40000 x 10% + 70000 x 20%) / 12
    expect(a.otherDeductions.toFixed(2)).toBe("765.00"); // 620 + 145 + 0 additional Medicare
    expect(a.netPay.toFixed(2)).toBe("7735.00");
    expect(a.employerContributions.toFixed(2)).toBe("1050.00"); // 620 + 145 + FUTA 42 + SUTA 243
    expect([line(a, "US-FUTA"), line(a, "US-SUTA"), line(a, "US-MED-ADD-EE")]).toEqual(["42.00", "243.00", "0.00"]);
    const b = await slipFor(january.id, bob.id);
    expect(b.taxDeduction.toFixed(2)).toBe("183.33"); // 16000 x 10% / 12 + 50 extra
    expect(b.netPay.toFixed(2)).toBe("2587.17");
    expect(b.employerContributions.toFixed(2)).toBe("328.50");

    const retry = await payroll.getPayrollRunForPostingRetry(us.organizationId, january.id);
    await expect(postPayrollRunAccounting(us.organizationId, retry!, us.userId)).resolves.toMatchObject({ posted: true });
    const entry = await testDb.accountingJournalEntry.findFirstOrThrow({ where: { organizationId: us.organizationId, sourceType: "PAYROLL_RUN", sourceId: january.id }, include: { lines: { include: { account: true } } } });
    const amount = (code: string, side: "debit" | "credit") => entry.lines.filter((l) => l.account.code === code).reduce((sum, l) => sum.plus(l[side]), new Prisma.Decimal(0)).toFixed(2);
    expect(entry.lines.reduce((sum, l) => sum.plus(l.debit), new Prisma.Decimal(0)).toFixed(2)).toBe(entry.lines.reduce((sum, l) => sum.plus(l.credit), new Prisma.Decimal(0)).toFixed(2));
    expect([amount("5190", "debit"), amount("6100", "debit")]).toEqual(["13000.00", "1378.50"]);
    expect([amount("2230", "credit"), amount("2210", "credit"), amount("2211", "credit"), amount("2212", "credit"), amount("2213", "credit"), amount("2214", "credit"), amount("2215", "credit"), amount("2216", "credit")])
      .toEqual(["10322.17", "1683.33", "806.00", "806.00", "188.50", "188.50", "60.00", "324.00"]);
    expect(amount("2220", "credit")).toBe("0.00");
  }, 120_000);

  it("carries year-to-date wages into later runs for wage bases", async () => {
    const february = await processMonth(2);
    const a = await slipFor(february.id, alice.id);
    expect([line(a, "US-SS-EE"), line(a, "US-SS-ER"), line(a, "US-FUTA"), line(a, "US-SUTA")]).toEqual(["310.00", "310.00", "0.00", "0.00"]);
    const b = await slipFor(february.id, bob.id);
    expect([line(b, "US-FUTA"), line(b, "US-SUTA")]).toEqual(["18.00", "81.00"]);
  }, 120_000);

  it("requires reconfirmation after a change and a filing status where withholding depends on it", async () => {
    await edit("US-MED-EE", { sourceReference: "Updated reference" });
    expect((await rule("US-MED-EE")).confirmedAt).toBeNull();
    const run = await payroll.createRun(us.organizationId, { periodStart: new Date("2026-03-01"), periodEnd: new Date("2026-03-31"), payDate: new Date("2026-03-31") });
    await expect(payroll.processRun(us.organizationId, run.id)).rejects.toThrow(/US-MED-EE/);
    await confirmAll();
    await payroll.setCompensation(us.organizationId, { employeeId: bob.id, baseSalary: "3000.00", effectiveDate: new Date("2026-01-01"), filingStatus: null });
    await expect(payroll.processRun(us.organizationId, run.id)).rejects.toThrow(PayrollDeductionError);
    expect(await testDb.payrollPayslip.count({ where: { payrollRunId: run.id } })).toBe(0);
  }, 120_000);

  it("never reads or changes another organization's rules", async () => {
    const target = await rule("US-MED-EE");
    await expect(confirmDeductionRule(other.organizationId, other.userId, target.id, true)).rejects.toThrow(/not found/);
    await expect(updateDeductionRule(other.organizationId, other.userId, target.id, { code: "X1", name: "Hijack", kind: "EMPLOYEE_CONTRIBUTION", method: "PERCENTAGE", taxYear: 2026, rate: "50", liabilityAccountCode: "2220" })).rejects.toThrow(/not found/);
    expect((await rule("US-MED-EE")).rate?.toString()).toBe("1.45");
  });
});
