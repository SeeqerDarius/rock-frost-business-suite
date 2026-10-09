import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as accounting from "@/modules/accounting/service";
import { createTaxExemption, createTaxRate, createTaxRule, provisionJurisdictionPack } from "@/modules/tax/service";
import { getExemptionReport, getTaxLiabilitiesByClass, getTaxReport } from "@/modules/tax/reports";
import { testDb } from "../setup/db";
import { cleanupTestOrg, createTestOrg, type TestOrg } from "../setup/fixtures";

let de: TestOrg;
let us: TestOrg;

const line = (unitPrice: string) => [{ description: "Service", quantity: "1", unitPrice }];
const ruleId = async (orgId: string, code: string) => (await testDb.taxRule.findFirstOrThrow({ where: { organizationId: orgId, code } })).id;

beforeAll(async () => {
  de = await createTestOrg("tax-packs-de");
  us = await createTestOrg("tax-packs-us");
  await testDb.organization.update({ where: { id: de.organizationId }, data: { currency: "EUR", country: "DE", jurisdictionCode: "EU-DE", timezone: "Europe/Berlin" } });
  await testDb.organization.update({ where: { id: us.organizationId }, data: { currency: "USD", country: "US", jurisdictionCode: "US", timezone: "America/New_York" } });
}, 60_000);

afterAll(async () => {
  await cleanupTestOrg(de);
  await cleanupTestOrg(us);
});

describe("EU pack for a German organization (real Postgres)", () => {
  it("seeds 27 member states, OSS schemes, and destination rules", async () => {
    const result = await provisionJurisdictionPack(de.organizationId, "EU", de.userId);
    expect(result.ratesCreated).toBe(27);
    expect(await testDb.taxJurisdiction.count({ where: { organizationId: de.organizationId } })).toBe(30);
    expect(await testDb.taxRule.count({ where: { organizationId: de.organizationId, categoryId: { not: null } } })).toBe(31);
  }, 60_000);

  it("charges German VAT domestically, nothing on intra-EU B2B, and French VAT on an OSS B2C sale", async () => {
    const domestic = await accounting.createInvoice(de.organizationId, { customerName: "Hamburg GmbH", lines: line("100.00"), issueDate: new Date("2026-11-03"), dueDate: new Date("2026-12-03"), taxRuleId: await ruleId(de.organizationId, "EU-DE-STANDARD") }, de.userId);
    const b2b = await accounting.createInvoice(de.organizationId, { customerName: "Paris SAS", lines: line("1000.00"), issueDate: new Date("2026-11-04"), dueDate: new Date("2026-12-04"), taxRuleId: await ruleId(de.organizationId, "EU-DE-INTRA-B2B-RC") }, de.userId);
    const oss = await accounting.createInvoice(de.organizationId, { customerName: "Lyon consumer", lines: line("50.00"), issueDate: new Date("2026-11-05"), dueDate: new Date("2026-12-05"), taxRuleId: await ruleId(de.organizationId, "EU-FR-OSS-B2C") }, de.userId);
    expect(domestic.taxAmount.toFixed(2)).toBe("19.00");
    expect(b2b.taxAmount.toFixed(2)).toBe("0.00");
    expect(b2b.taxTreatment).toBe("REVERSE_CHARGE");
    expect(oss.taxAmount.toFixed(2)).toBe("10.00");
    for (const invoice of [domestic, b2b, oss]) await accounting.markInvoiceSent(de.organizationId, invoice.id);

    const report = await getTaxReport(de.organizationId, { from: "2026-11-01", to: "2026-11-30", view: "jurisdiction" });
    const germany = report.rows.find((row) => row.key === "EU-DE")!;
    const france = report.rows.find((row) => row.key === "EU-FR")!;
    expect(germany.taxableSales.toFixed(2)).toBe("100.00");
    expect(germany.reverseChargeSales.toFixed(2)).toBe("1000.00");
    expect(germany.taxCollected.toFixed(2)).toBe("19.00");
    expect(france.taxableSales.toFixed(2)).toBe("50.00");
    expect(france.taxCollected.toFixed(2)).toBe("10.00");
    expect(report.totals.netPayable.toFixed(2)).toBe("29.00");
  }, 90_000);
});

describe("US pack and sales tax reporting (real Postgres)", () => {
  it("seeds states and separate federal accounts without creating any rate", async () => {
    const result = await provisionJurisdictionPack(us.organizationId, "US", us.userId);
    expect(result).toMatchObject({ ratesCreated: 0, rulesCreated: 0 });
    expect(await testDb.taxJurisdiction.count({ where: { organizationId: us.organizationId, level: "STATE" } })).toBe(51);
    const codes = (await testDb.accountingAccount.findMany({ where: { organizationId: us.organizationId, code: { in: ["2200", "2211", "2215", "2140"] } }, select: { code: true } })).map((a) => a.code).sort();
    expect(codes).toEqual(["2140", "2200", "2211", "2215"]);
  }, 60_000);

  it("reports by state and level, keeps sales tax out of VAT, and respects the organization timezone", async () => {
    await createTaxRate(us.organizationId, us.userId, { code: "NY-STATE", name: "New York state", jurisdictionCode: "US-NY", taxKind: "SALES", rate: "4", effectiveFrom: "2026-01-01", recoverable: false });
    const rule = await createTaxRule(us.organizationId, us.userId, { code: "NY-TAXABLE", name: "New York taxable", jurisdictionCode: "US-NY", treatment: "STANDARD", rateCodes: ["NY-STATE"], effectiveFrom: "2026-01-01" });
    // 31 October 22:00 in New York is already 1 November in UTC.
    const lateOctober = await accounting.createInvoice(us.organizationId, { customerName: "Halloween Store", lines: line("100.00"), issueDate: new Date("2026-11-01T02:00:00Z"), dueDate: new Date("2026-12-01"), taxRuleId: rule.id }, us.userId);
    const november = await accounting.createInvoice(us.organizationId, { customerName: "Brooklyn Store", lines: line("200.00"), issueDate: new Date("2026-11-10T15:00:00Z"), dueDate: new Date("2026-12-10"), taxRuleId: rule.id }, us.userId);
    const contact = await accounting.createContact(us.organizationId, { type: "CUSTOMER", name: "NY Reseller" }, us.userId);
    await createTaxExemption(us.organizationId, us.userId, { contactId: contact.id, exemptionType: "RESALE", certificateNumber: "ST-120-1", validFrom: "2026-01-01" });
    const exempt = await accounting.createInvoice(us.organizationId, { contactId: contact.id, customerName: "NY Reseller", lines: line("300.00"), issueDate: new Date("2026-11-12T15:00:00Z"), dueDate: new Date("2026-12-12"), taxRuleId: rule.id }, us.userId);
    for (const invoice of [lateOctober, november, exempt]) await accounting.markInvoiceSent(us.organizationId, invoice.id);

    const byState = await getTaxReport(us.organizationId, { from: "2026-11-01", to: "2026-11-30", view: "jurisdiction" });
    const ny = byState.rows.find((row) => row.key === "US-NY")!;
    expect(ny.taxableSales.toFixed(2)).toBe("200.00");
    expect(ny.exemptSales.toFixed(2)).toBe("300.00");
    expect(ny.taxCollected.toFixed(2)).toBe("8.00");
    const october = await getTaxReport(us.organizationId, { from: "2026-10-01", to: "2026-10-31", view: "jurisdiction" });
    expect(october.rows.find((row) => row.key === "US-NY")?.taxCollected.toFixed(2)).toBe("4.00");

    const byLevel = await getTaxReport(us.organizationId, { from: "2026-11-01", to: "2026-11-30", view: "level" });
    expect(byLevel.rows.find((row) => row.key === "STATE")?.taxCollected.toFixed(2)).toBe("8.00");
    const byKind = await getTaxReport(us.organizationId, { from: "2026-11-01", to: "2026-11-30", view: "kind" });
    expect(byKind.rows.map((row) => row.key)).toContain("SALES");
    expect(byKind.rows.find((row) => row.key === "VAT")).toBeUndefined();

    const exemptions = await getExemptionReport(us.organizationId, { from: "2026-11-01", to: "2026-11-30" });
    expect(exemptions).toHaveLength(1);
    expect(exemptions[0]).toMatchObject({ customer: "NY Reseller" });
    expect(exemptions[0].certificates[0]).toContain("ST-120-1");
    expect(exemptions[0].exemptSales.toFixed(2)).toBe("300.00");

    const liabilities = await getTaxLiabilitiesByClass(us.organizationId, "2026-11-30");
    expect(liabilities.find((klass) => klass.key === "SALES")?.balance).toBeCloseTo(12, 2);
    expect(liabilities.find((klass) => klass.key === "PAYROLL")?.balance).toBe(0);
  }, 90_000);
});

describe("tax report tenant isolation (real Postgres)", () => {
  it("never includes another organization's tax entries", async () => {
    const report = await getTaxReport(de.organizationId, { from: "2026-10-01", to: "2026-11-30", view: "jurisdiction" });
    expect(report.rows.some((row) => row.key.startsWith("US"))).toBe(false);
    const usReport = await getTaxReport(us.organizationId, { from: "2026-10-01", to: "2026-11-30", view: "jurisdiction" });
    expect(usReport.rows.some((row) => row.key.startsWith("EU"))).toBe(false);
  }, 60_000);
});
