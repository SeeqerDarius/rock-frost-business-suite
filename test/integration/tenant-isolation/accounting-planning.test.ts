import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createManualJournalEntry, ensureDefaultAccounts } from "@/modules/accounting/service";
import {
  AccountingPlanApprovalError,
  AccountingPlanValidationError,
  approveAccountingPlan,
  createAccountingPlan,
  createAccountingPlanRevision,
  getAccountingPlanVariance,
  submitAccountingPlan,
  upsertAccountingPlanLine,
} from "@/modules/accounting/planning-service";
import { testDb } from "../setup/db";
import { cleanupTestOrg, createTestOrg, type TestOrg } from "../setup/fixtures";

let org: TestOrg;
let otherOrg: TestOrg;
let approverId: string;

beforeAll(async () => {
  org = await createTestOrg("accounting-planning");
  otherOrg = await createTestOrg("accounting-planning-other");
  await testDb.organization.update({ where: { id: org.organizationId }, data: { currency: "GHS" } });
  const approver = await testDb.user.create({ data: { email: `planning-approver-${Date.now()}@example.invalid`, name: "Plan Approver", status: "ACTIVE" } });
  approverId = approver.id;
});

afterAll(async () => {
  await cleanupTestOrg(org);
  await cleanupTestOrg(otherOrg);
  await testDb.user.delete({ where: { id: approverId } }).catch(() => {});
});

describe("Accounting budgets and forecasts (real Postgres)", () => {
  it("keeps plan lines tenant scoped and produces Decimal actual-versus-budget variance", async () => {
    const accounts = await ensureDefaultAccounts(org.organizationId);
    const revenue = accounts.find((account) => account.code === "4000")!;
    const cash = accounts.find((account) => account.code === "1000")!;
    const plan = await createAccountingPlan(org.organizationId, { name: "2027 Revenue", kind: "BUDGET", startDate: new Date("2027-01-01"), endDate: new Date("2027-12-31") }, org.userId);
    await expect(upsertAccountingPlanLine(org.organizationId, plan.id, { accountId: (await ensureDefaultAccounts(otherOrg.organizationId))[0].id, periodStart: new Date("2027-01-01"), amount: "1000" })).rejects.toBeInstanceOf(AccountingPlanValidationError);
    await Promise.all([
      upsertAccountingPlanLine(org.organizationId, plan.id, { accountId: revenue.id, periodStart: new Date("2027-01-01"), amount: "1000" }),
      upsertAccountingPlanLine(org.organizationId, plan.id, { accountId: revenue.id, periodStart: new Date("2027-01-01"), amount: "1200" }),
    ]);
    expect(await testDb.accountingPlanLine.count({ where: { planId: plan.id } })).toBe(1);
    await createManualJournalEntry(org.organizationId, { entryDate: new Date("2027-01-15"), description: "January revenue", createdById: org.userId, lines: [{ accountId: cash.id, debit: "900" }, { accountId: revenue.id, credit: "900" }] });
    const rows = await getAccountingPlanVariance(org.organizationId, plan.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].actual.toFixed(2)).toBe("900.00");
    expect(["-100.00", "-300.00"]).toContain(rows[0].variance.toFixed(2));
    expect(rows[0].favorable).toBe(false);
  }, 60_000);

  it("enforces maker-checker approval and creates an immutable draft revision", async () => {
    const account = (await ensureDefaultAccounts(org.organizationId)).find((item) => item.code === "5000")!;
    const plan = await createAccountingPlan(org.organizationId, { name: "2027 Costs", kind: "FORECAST", startDate: new Date("2027-01-01"), endDate: new Date("2027-12-31"), actualThroughDate: new Date("2027-03-31") }, org.userId);
    await upsertAccountingPlanLine(org.organizationId, plan.id, { accountId: account.id, periodStart: new Date("2027-04-01"), amount: "500" });
    await submitAccountingPlan(org.organizationId, plan.id, org.userId);
    await expect(approveAccountingPlan(org.organizationId, plan.id, org.userId)).rejects.toBeInstanceOf(AccountingPlanApprovalError);
    await Promise.allSettled([
      approveAccountingPlan(org.organizationId, plan.id, approverId),
      approveAccountingPlan(org.organizationId, plan.id, approverId),
    ]).then((results) => expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1));
    const revision = await createAccountingPlanRevision(org.organizationId, plan.id, org.userId);
    expect(revision.status).toBe("DRAFT");
    expect(revision.revision).toBe(2);
    expect(await testDb.accountingPlanLine.count({ where: { planId: revision.id } })).toBe(1);
    expect(await testDb.accountingPlanDecision.count({ where: { planId: plan.id } })).toBeGreaterThanOrEqual(3);
  }, 60_000);
});
