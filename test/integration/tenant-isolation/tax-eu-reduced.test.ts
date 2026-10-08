import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as accounting from "@/modules/accounting/service";
import { applyEuReducedRates, provisionJurisdictionPack } from "@/modules/tax/service";
import { getOssReturn } from "@/modules/tax/reports";
import { testDb } from "../setup/db";
import { cleanupTestOrg, createTestOrg, type TestOrg } from "../setup/fixtures";

let de: TestOrg;
let gh: TestOrg;
const line = (unitPrice: string) => [{ description: "Books", quantity: "1", unitPrice }];
const ruleId = async (orgId: string, code: string) => (await testDb.taxRule.findFirstOrThrow({ where: { organizationId: orgId, code } })).id;

beforeAll(async () => {
  de = await createTestOrg("tax-eu-reduced-de");
  gh = await createTestOrg("tax-eu-reduced-gh");
  await testDb.organization.update({ where: { id: de.organizationId }, data: { currency: "EUR", country: "DE", jurisdictionCode: "EU-DE", timezone: "Europe/Berlin" } });
  await testDb.organization.update({ where: { id: gh.organizationId }, data: { currency: "GHS", country: "GH", jurisdictionCode: "GH" } });
  await provisionJurisdictionPack(de.organizationId, "EU", de.userId);
  await accounting.ensureDefaultAccounts(de.organizationId);
}, 120_000);

afterAll(async () => {
  await cleanupTestOrg(de);
  await cleanupTestOrg(gh);
});

describe("EU reduced-rate catalog (real Postgres)", () => {
  it("requires confirmation, an EU establishment, and the EU pack", async () => {
    await expect(applyEuReducedRates(de.organizationId, de.userId, { memberStates: ["DE"], effectiveFrom: "2026-01-01", confirmed: false })).rejects.toThrow(/Confirm/);
    await expect(applyEuReducedRates(gh.organizationId, gh.userId, { memberStates: ["DE"], effectiveFrom: "2026-01-01", confirmed: true })).rejects.toThrow(/EU member state/);
    await expect(applyEuReducedRates(de.organizationId, de.userId, { memberStates: ["GB"], effectiveFrom: "2026-01-01", confirmed: true })).rejects.toThrow(/not an EU member state/);
  });

  it("creates reduced rates with a domestic rule for the home state and OSS rules for others, idempotently", async () => {
    const first = await applyEuReducedRates(de.organizationId, de.userId, { memberStates: ["DE", "FR"], effectiveFrom: "2026-01-01", confirmed: true });
    expect(first).toEqual({ ratesCreated: 4, rulesCreated: 4 });
    const domestic = await testDb.taxRule.findFirstOrThrow({ where: { organizationId: de.organizationId, code: "EU-DE-REDUCED-7" } });
    expect(domestic).toMatchObject({ treatment: "REDUCED", rateCodes: ["EU-DE-RED-7"] });
    expect(await testDb.taxRule.count({ where: { organizationId: de.organizationId, code: { in: ["EU-FR-OSS-B2C-RED-5_5", "EU-FR-OSS-B2C-RED-10", "EU-FR-OSS-B2C-RED-2_1"] } } })).toBe(3);
    const frRate = await testDb.taxRate.findFirstOrThrow({ where: { organizationId: de.organizationId, code: "EU-FR-RED-5_5" } });
    expect(frRate.rate.toString()).toBe("5.5");
    expect(frRate.sourceReference).toContain("taxation_customs/tedb");
    expect(await applyEuReducedRates(de.organizationId, de.userId, { memberStates: ["DE", "FR"], effectiveFrom: "2026-01-01", confirmed: true })).toEqual({ ratesCreated: 0, rulesCreated: 0 });
    expect(await testDb.auditLog.count({ where: { organizationId: de.organizationId, action: "tax_pack.eu_reduced_rates_applied" } })).toBe(2);
  }, 90_000);

  it("taxes documents at the reduced rate and reports reduced-rate OSS supplies", async () => {
    const domestic = await accounting.createInvoice(de.organizationId, { customerName: "Berlin bookshop", lines: line("100.00"), issueDate: new Date("2026-11-03"), dueDate: new Date("2026-12-03"), taxRuleId: await ruleId(de.organizationId, "EU-DE-REDUCED-7") }, de.userId);
    expect(domestic.taxAmount.toFixed(2)).toBe("7.00");
    const oss = await accounting.createInvoice(de.organizationId, { customerName: "Paris reader", lines: line("200.00"), issueDate: new Date("2026-11-04"), dueDate: new Date("2026-12-04"), taxRuleId: await ruleId(de.organizationId, "EU-FR-OSS-B2C-RED-5_5") }, de.userId);
    expect(oss.taxAmount.toFixed(2)).toBe("11.00");
    await accounting.markInvoiceSent(de.organizationId, domestic.id);
    await accounting.markInvoiceSent(de.organizationId, oss.id);
    const worksheet = await getOssReturn(de.organizationId, { from: "2026-11-01", to: "2026-11-30" });
    const fr = worksheet.rows.find((row) => row.memberState === "FR" && row.rate.toString() === "5.5");
    expect(fr?.vatAmount.toFixed(2)).toBe("11.00");
    expect(worksheet.rows.some((row) => row.memberState === "DE")).toBe(false);
  }, 90_000);
});
