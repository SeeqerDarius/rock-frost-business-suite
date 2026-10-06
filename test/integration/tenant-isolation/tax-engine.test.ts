import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import * as accounting from "@/modules/accounting/service";
import { getTaxReturnWorkingReport, createTaxPeriod } from "@/modules/accounting/tax-service";
import {
  createJurisdiction,
  createTaxExemption,
  createTaxRate,
  createTaxRateVersion,
  createTaxRule,
  provisionJurisdictionPack,
  resolveDocumentTax,
  upsertTaxRegistration,
} from "@/modules/tax/service";
import { testDb } from "../setup/db";
import { cleanupTestOrg, createTestOrg, type TestOrg } from "../setup/fixtures";

let gh: TestOrg;
let us: TestOrg;
let ghStandardRuleId: string;
let usRuleId: string;
let expenseId: string;

const line = (unitPrice: string) => [{ description: "Taxable service", quantity: "1", unitPrice }];

async function journal(orgId: string, sourceType: string, sourceId: string) {
  return testDb.accountingJournalEntry.findFirstOrThrow({ where: { organizationId: orgId, sourceType, sourceId }, include: { lines: { include: { account: true } } } });
}
const amountOn = (entry: Awaited<ReturnType<typeof journal>>, code: string, side: "debit" | "credit") =>
  entry.lines.filter((l) => l.account.code === code).reduce((sum, l) => sum.plus(l[side]), new Prisma.Decimal(0)).toFixed(2);
const balanced = (entry: Awaited<ReturnType<typeof journal>>) => {
  const d = entry.lines.reduce((sum, l) => sum.plus(l.debit), new Prisma.Decimal(0));
  const c = entry.lines.reduce((sum, l) => sum.plus(l.credit), new Prisma.Decimal(0));
  return d.toFixed(2) === c.toFixed(2);
};

beforeAll(async () => {
  gh = await createTestOrg("tax-engine-gh");
  us = await createTestOrg("tax-engine-us");
  await testDb.organization.update({ where: { id: gh.organizationId }, data: { currency: "GHS", country: "GH", jurisdictionCode: "GH" } });
  await testDb.organization.update({ where: { id: us.organizationId }, data: { currency: "USD", country: "US", jurisdictionCode: "US", timezone: "America/New_York" } });

  await provisionJurisdictionPack(gh.organizationId, "GH", gh.userId);
  ghStandardRuleId = (await testDb.taxRule.findFirstOrThrow({ where: { organizationId: gh.organizationId, code: "GH-STANDARD" } })).id;

  // A US organization configures state and county sales tax itself.
  await createJurisdiction(us.organizationId, us.userId, { code: "US", name: "United States", level: "COUNTRY", countryCode: "US" });
  await createJurisdiction(us.organizationId, us.userId, { code: "US-GA", name: "Georgia", level: "STATE", countryCode: "US", parentCode: "US" });
  await createJurisdiction(us.organizationId, us.userId, { code: "US-GA-FULTON", name: "Fulton County", level: "COUNTY", countryCode: "US", parentCode: "US-GA" });
  await createJurisdiction(us.organizationId, us.userId, { code: "US-GA-ATLANTA", name: "Atlanta", level: "CITY", countryCode: "US", parentCode: "US-GA-FULTON" });
  await createTaxRate(us.organizationId, us.userId, { code: "GA-STATE", name: "Georgia state sales tax", jurisdictionCode: "US-GA", taxKind: "SALES", rate: "4", effectiveFrom: "2026-01-01", recoverable: false });
  await createTaxRate(us.organizationId, us.userId, { code: "GA-FULTON", name: "Fulton County sales tax", jurisdictionCode: "US-GA-FULTON", taxKind: "SALES", rate: "3", effectiveFrom: "2026-01-01", recoverable: false });
  await createTaxRate(us.organizationId, us.userId, { code: "GA-ATLANTA", name: "Atlanta MOST", jurisdictionCode: "US-GA-ATLANTA", taxKind: "SALES", rate: "1.9", effectiveFrom: "2026-01-01", recoverable: false });
  usRuleId = (await createTaxRule(us.organizationId, us.userId, { code: "GA-ATLANTA-TAXABLE", name: "Atlanta taxable goods", jurisdictionCode: "US-GA-ATLANTA", treatment: "STANDARD", rateCodes: ["GA-STATE", "GA-FULTON", "GA-ATLANTA"], effectiveFrom: "2026-01-01" })).id;
  expenseId = (await accounting.ensureDefaultAccounts(us.organizationId)).find((a) => a.code === "5000")!.id;
}, 90_000);

afterAll(async () => {
  await cleanupTestOrg(gh);
  await cleanupTestOrg(us);
});

describe("Ghana pack through the tax engine (real Postgres)", () => {
  it("is idempotent and never overwrites existing configuration", async () => {
    const again = await provisionJurisdictionPack(gh.organizationId, "GH", gh.userId);
    expect(again).toMatchObject({ ratesCreated: 0, rulesCreated: 0 });
  });

  it("stores a tax-line snapshot, posts each component separately, and feeds the VAT working return", async () => {
    const invoice = await accounting.createInvoice(gh.organizationId, { customerName: "Kumasi Traders", lines: line("100.00"), issueDate: new Date("2026-11-10"), dueDate: new Date("2026-12-10"), taxRuleId: ghStandardRuleId }, gh.userId);
    expect(invoice.amount.toFixed(2)).toBe("120.00");
    expect(invoice.taxAmount.toFixed(2)).toBe("20.00");
    expect(invoice.vatAmount.toFixed(2)).toBe("0.00");
    const snapshot = await testDb.documentTaxLine.findMany({ where: { organizationId: gh.organizationId, documentId: invoice.id }, orderBy: { sortOrder: "asc" } });
    expect(snapshot.map((l) => [l.code, l.taxAmount.toFixed(2)])).toEqual([["GH-VAT", "15.00"], ["GH-NHIL", "2.50"], ["GH-GETFUND", "2.50"]]);

    await accounting.markInvoiceSent(gh.organizationId, invoice.id);
    const sent = await journal(gh.organizationId, "INVOICE", invoice.id);
    expect(balanced(sent)).toBe(true);
    expect(amountOn(sent, "1100", "debit")).toBe("120.00");
    expect(amountOn(sent, "2100", "credit")).toBe("15.00");
    expect(amountOn(sent, "2110", "credit")).toBe("2.50");
    expect(amountOn(sent, "2120", "credit")).toBe("2.50");
    const ledger = await testDb.taxLedgerEntry.findMany({ where: { organizationId: gh.organizationId, sourceId: invoice.id } });
    expect(ledger).toHaveLength(3);

    const period = await createTaxPeriod(gh.organizationId, { name: "November 2026", jurisdiction: "GH", startDate: new Date("2026-11-01"), endDate: new Date("2026-11-30T23:59:59.999Z"), filingDueDate: new Date("2026-12-31") });
    const report = await getTaxReturnWorkingReport(gh.organizationId, period.id);
    expect(report.output.vatAmount.toFixed(2)).toBe("15.00");
    expect(report.output.nhilAmount.toFixed(2)).toBe("2.50");
  }, 60_000);

  it("applies a new rate only from its effective date and never rewrites earlier documents", async () => {
    const before = await accounting.createInvoice(gh.organizationId, { customerName: "Before Change", lines: line("100.00"), issueDate: new Date("2026-11-20"), dueDate: new Date("2026-12-20"), taxRuleId: ghStandardRuleId }, gh.userId);
    await createTaxRateVersion(gh.organizationId, gh.userId, { code: "GH-VAT", rate: "20", effectiveFrom: "2026-12-01", sourceReference: "Test change" });
    await expect(createTaxRateVersion(gh.organizationId, gh.userId, { code: "GH-VAT", rate: "25", effectiveFrom: "2026-11-30" })).rejects.toThrow(/cannot be rewritten/);

    const after = await accounting.createInvoice(gh.organizationId, { customerName: "After Change", lines: line("100.00"), issueDate: new Date("2026-12-05"), dueDate: new Date("2027-01-05"), taxRuleId: ghStandardRuleId }, gh.userId);
    const backdated = await accounting.createInvoice(gh.organizationId, { customerName: "Backdated", lines: line("100.00"), issueDate: new Date("2026-11-25"), dueDate: new Date("2026-12-25"), taxRuleId: ghStandardRuleId }, gh.userId);
    expect(after.taxAmount.toFixed(2)).toBe("25.00");
    expect(backdated.taxAmount.toFixed(2)).toBe("20.00");
    const beforeLines = await testDb.documentTaxLine.findFirstOrThrow({ where: { organizationId: gh.organizationId, documentId: before.id, code: "GH-VAT" } });
    expect(beforeLines.rate.toFixed(0)).toBe("15");
    expect(beforeLines.taxAmount.toFixed(2)).toBe("15.00");
    const versions = await testDb.taxRate.findMany({ where: { organizationId: gh.organizationId, code: "GH-VAT" }, orderBy: { version: "asc" } });
    expect(versions.map((v) => [v.version, v.rate.toFixed(0), v.effectiveTo?.toISOString().slice(0, 10) ?? null])).toEqual([[1, "15", "2026-11-30"], [2, "20", null]]);
  }, 60_000);

  it("reverses an engine-taxed invoice exactly on void", async () => {
    const invoice = await accounting.createInvoice(gh.organizationId, { customerName: "Void Me", lines: line("50.00"), issueDate: new Date("2026-11-12"), dueDate: new Date("2026-12-12"), taxRuleId: ghStandardRuleId }, gh.userId);
    await accounting.markInvoiceSent(gh.organizationId, invoice.id);
    await accounting.voidInvoice(gh.organizationId, invoice.id);
    const sent = await journal(gh.organizationId, "INVOICE", invoice.id);
    const voided = await journal(gh.organizationId, "INVOICE_VOID", invoice.id);
    expect(amountOn(voided, "1100", "credit")).toBe(amountOn(sent, "1100", "debit"));
    const net = await testDb.taxLedgerEntry.aggregate({ where: { organizationId: gh.organizationId, sourceId: invoice.id }, _sum: { taxAmount: true } });
    expect(net._sum.taxAmount?.toFixed(2)).toBe("0.00");
  }, 60_000);
});

describe("US layered sales tax (real Postgres)", () => {
  it("charges state, county, and city sales tax as separate jurisdiction lines", async () => {
    const invoice = await accounting.createInvoice(us.organizationId, { customerName: "Peachtree Retail", lines: line("200.00"), issueDate: new Date("2026-11-10"), dueDate: new Date("2026-12-10"), taxRuleId: usRuleId }, us.userId);
    expect(invoice.taxAmount.toFixed(2)).toBe("17.80");
    await accounting.markInvoiceSent(us.organizationId, invoice.id);
    const sent = await journal(us.organizationId, "INVOICE", invoice.id);
    expect(amountOn(sent, "2140", "credit")).toBe("17.80");
    expect(amountOn(sent, "2100", "credit")).toBe("0.00");
    const ledger = await testDb.taxLedgerEntry.findMany({ where: { organizationId: us.organizationId, sourceId: invoice.id }, orderBy: { jurisdictionCode: "asc" } });
    expect(ledger.map((r) => [r.jurisdictionCode, r.taxKind, r.taxAmount.toFixed(2)])).toEqual([["US-GA", "SALES", "8.00"], ["US-GA-ATLANTA", "SALES", "3.80"], ["US-GA-FULTON", "SALES", "6.00"]]);
  }, 60_000);

  it("skips components where collection is explicitly disabled", async () => {
    await upsertTaxRegistration(us.organizationId, us.userId, { jurisdictionCode: "US-GA-ATLANTA", status: "MONITORING", collectionEnabled: false });
    const resolved = await resolveDocumentTax(us.organizationId, { ruleId: usRuleId, date: new Date("2026-11-15"), amount: "100", pricesIncludeTax: false });
    expect(resolved.skippedComponents).toEqual(["GA-ATLANTA"]);
    expect(resolved.calculation.totalTax.toFixed(2)).toBe("7.00");
    await expect(upsertTaxRegistration(us.organizationId, us.userId, { jurisdictionCode: "US-GA", status: "MONITORING", collectionEnabled: true })).rejects.toThrow(/registered/);
  }, 60_000);

  it("exempts a customer with a valid resale certificate and records it for reporting", async () => {
    const contact = await accounting.createContact(us.organizationId, { type: "CUSTOMER", name: "Reseller Inc" }, us.userId);
    await createTaxExemption(us.organizationId, us.userId, { contactId: contact.id, exemptionType: "RESALE", certificateNumber: "GA-RES-1001", validFrom: "2026-01-01" });
    const invoice = await accounting.createInvoice(us.organizationId, { contactId: contact.id, customerName: "Reseller Inc", lines: line("500.00"), issueDate: new Date("2026-11-11"), dueDate: new Date("2026-12-11"), taxRuleId: usRuleId }, us.userId);
    expect(invoice.taxTreatment).toBe("EXEMPT");
    expect(invoice.taxAmount.toFixed(2)).toBe("0.00");
    await accounting.markInvoiceSent(us.organizationId, invoice.id);
    const ledger = await testDb.taxLedgerEntry.findMany({ where: { organizationId: us.organizationId, sourceId: invoice.id } });
    expect(ledger.every((r) => r.customerExempt && r.treatment === "EXEMPT")).toBe(true);
    expect(ledger.every((r) => r.taxableAmount.toFixed(2) === "500.00")).toBe(true);
  }, 60_000);

  it("self-assesses reverse-charge VAT on a purchase without owing it to the supplier", async () => {
    await createJurisdiction(us.organizationId, us.userId, { code: "EU-DE", name: "Germany", level: "COUNTRY", countryCode: "DE" });
    await createTaxRate(us.organizationId, us.userId, { code: "DE-VAT-RC", name: "German VAT (reverse charge)", jurisdictionCode: "EU-DE", taxKind: "VAT", rate: "19", effectiveFrom: "2026-01-01", outputAccountCode: "2100", inputAccountCode: "1300" });
    const rule = await createTaxRule(us.organizationId, us.userId, { code: "DE-RC", name: "Reverse charge", jurisdictionCode: "EU-DE", treatment: "REVERSE_CHARGE", rateCodes: ["DE-VAT-RC"], effectiveFrom: "2026-01-01" });
    const bill = await accounting.createBill(us.organizationId, { supplierName: "Berlin Software GmbH", expenseAccountId: expenseId, lines: line("1000.00"), billDate: new Date("2026-11-10"), dueDate: new Date("2026-12-10"), taxRuleId: rule.id }, us.userId);
    expect(bill.amount.toFixed(2)).toBe("1000.00");
    await accounting.approveBill(us.organizationId, bill.id, us.userId);
    const approved = await journal(us.organizationId, "ACCOUNTING_BILL", bill.id);
    expect(balanced(approved)).toBe(true);
    expect(amountOn(approved, "2000", "credit")).toBe("1000.00");
    expect(amountOn(approved, "1300", "debit")).toBe("190.00");
    expect(amountOn(approved, "2100", "credit")).toBe("190.00");
  }, 60_000);
});

describe("tax configuration tenant isolation (real Postgres)", () => {
  it("never resolves another organization's rule, even with its exact id", async () => {
    await expect(resolveDocumentTax(us.organizationId, { ruleId: ghStandardRuleId, date: new Date("2026-11-15"), amount: "100", pricesIncludeTax: false })).rejects.toThrow(/not found/);
    await expect(accounting.createInvoice(us.organizationId, { customerName: "Forged", lines: line("10.00"), issueDate: new Date("2026-11-10"), dueDate: new Date("2026-12-10"), taxRuleId: ghStandardRuleId }, us.userId)).rejects.toThrow(/not found/);
  }, 60_000);

  it("rejects an exemption for another organization's contact", async () => {
    const foreignContact = await accounting.createContact(gh.organizationId, { type: "CUSTOMER", name: "Ghana Contact" }, gh.userId);
    await expect(createTaxExemption(us.organizationId, us.userId, { contactId: foreignContact.id, exemptionType: "RESALE", validFrom: "2026-01-01" })).rejects.toThrow(/not found/);
  }, 60_000);
});
