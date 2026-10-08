import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import * as accounting from "@/modules/accounting/service";
import { applyEuReducedRates, provisionJurisdictionPack } from "@/modules/tax/service";
import { getTaxReport } from "@/modules/tax/reports";
import { testDb } from "../setup/db";
import { cleanupTestOrg, createTestOrg, type TestOrg } from "../setup/fixtures";

let de: TestOrg;
let other: TestOrg;
let expenseId: string;
let standard: string;
let reduced: string;
let exempt: string;

const ruleId = async (orgId: string, code: string) => (await testDb.taxRule.findFirstOrThrow({ where: { organizationId: orgId, code } })).id;
async function journal(orgId: string, sourceType: string, sourceId: string) {
  return testDb.accountingJournalEntry.findFirstOrThrow({ where: { organizationId: orgId, sourceType, sourceId }, include: { lines: { include: { account: true } } } });
}
const amountOn = (entry: Awaited<ReturnType<typeof journal>>, code: string, side: "debit" | "credit") =>
  entry.lines.filter((l) => l.account.code === code).reduce((sum, l) => sum.plus(l[side]), new Prisma.Decimal(0)).toFixed(2);
const balanced = (entry: Awaited<ReturnType<typeof journal>>) =>
  entry.lines.reduce((sum, l) => sum.plus(l.debit), new Prisma.Decimal(0)).toFixed(2) === entry.lines.reduce((sum, l) => sum.plus(l.credit), new Prisma.Decimal(0)).toFixed(2);

const mixedLines = () => [
  { description: "Printer", quantity: "1", unitPrice: "100.00" },
  { description: "Books", quantity: "2", unitPrice: "25.00", taxRuleId: reduced },
  { description: "Training course", quantity: "1", unitPrice: "40.00", taxRuleId: exempt },
];

beforeAll(async () => {
  de = await createTestOrg("tax-lines-de");
  other = await createTestOrg("tax-lines-other");
  await testDb.organization.update({ where: { id: de.organizationId }, data: { currency: "EUR", country: "DE", jurisdictionCode: "EU-DE", timezone: "Europe/Berlin" } });
  await provisionJurisdictionPack(de.organizationId, "EU", de.userId);
  await applyEuReducedRates(de.organizationId, de.userId, { memberStates: ["DE"], effectiveFrom: "2026-01-01", confirmed: true });
  expenseId = (await accounting.ensureDefaultAccounts(de.organizationId)).find((a) => a.code === "5000")!.id;
  standard = await ruleId(de.organizationId, "EU-DE-STANDARD");
  reduced = await ruleId(de.organizationId, "EU-DE-REDUCED-7");
  exempt = await ruleId(de.organizationId, "EU-DE-EXEMPT");
}, 120_000);

afterAll(async () => {
  await cleanupTestOrg(de);
  await cleanupTestOrg(other);
});

describe("per-line tax rules (real Postgres)", () => {
  it("taxes each line under its own rule and posts one balanced journal", async () => {
    const invoice = await accounting.createInvoice(de.organizationId, { customerName: "Berlin Buchhandlung", lines: mixedLines(), issueDate: new Date("2026-11-03"), dueDate: new Date("2026-12-03"), taxRuleId: standard, pricesIncludeTax: false }, de.userId);
    expect(invoice.taxableAmount.toFixed(2)).toBe("190.00");
    expect(invoice.taxAmount.toFixed(2)).toBe("22.50"); // 19% of 100 + 7% of 50 + 0 on 40
    expect(invoice.amount.toFixed(2)).toBe("212.50");
    expect(invoice).toMatchObject({ taxRuleId: standard, taxTreatment: "STANDARD" });
    const lines = [...invoice.lines].sort((a, b) => a.sortOrder - b.sortOrder);
    expect(lines.map((l) => l.taxRuleId)).toEqual([null, reduced, exempt]);

    const rows = await testDb.documentTaxLine.findMany({ where: { organizationId: de.organizationId, documentType: "INVOICE", documentId: invoice.id }, orderBy: { sortOrder: "asc" } });
    expect(rows.map((r) => [r.treatment, r.taxRuleId, r.taxableAmount.toFixed(2), r.taxAmount.toFixed(2)])).toEqual([
      ["STANDARD", standard, "100.00", "19.00"],
      ["REDUCED", reduced, "50.00", "3.50"],
      ["EXEMPT", exempt, "40.00", "0.00"],
    ]);

    await accounting.markInvoiceSent(de.organizationId, invoice.id);
    const entry = await journal(de.organizationId, "INVOICE", invoice.id);
    expect(balanced(entry)).toBe(true);
    expect(amountOn(entry, "1100", "debit")).toBe("212.50");
    expect(amountOn(entry, "4000", "credit")).toBe("190.00");
    expect(amountOn(entry, "2100", "credit")).toBe("22.50");
    const ledger = await testDb.taxLedgerEntry.findMany({ where: { organizationId: de.organizationId, sourceType: "ACCOUNTING_INVOICE", sourceId: invoice.id } });
    expect(ledger.map((r) => r.treatment).sort()).toEqual(["EXEMPT", "REDUCED", "STANDARD"]);
  }, 90_000);

  it("keeps a single-rule document exactly as before (one group, no line rules)", async () => {
    const invoice = await accounting.createInvoice(de.organizationId, { customerName: "Köln GmbH", lines: [{ description: "Service", quantity: "1", unitPrice: "100.00", taxRuleId: standard }], issueDate: new Date("2026-11-04"), dueDate: new Date("2026-12-04"), taxRuleId: standard, pricesIncludeTax: false }, de.userId);
    expect(invoice.taxAmount.toFixed(2)).toBe("19.00");
    expect(invoice.lines[0].taxRuleId).toBeNull();
    expect(await testDb.documentTaxLine.count({ where: { organizationId: de.organizationId, documentId: invoice.id } })).toBe(1);
  });

  it("balances inclusive prices per rule group", async () => {
    const invoice = await accounting.createInvoice(de.organizationId, { customerName: "Café", lines: [{ description: "Coffee machine", quantity: "1", unitPrice: "119.00" }, { description: "Cookbook", quantity: "1", unitPrice: "10.70", taxRuleId: reduced }], issueDate: new Date("2026-11-05"), dueDate: new Date("2026-12-05"), taxRuleId: standard, pricesIncludeTax: true }, de.userId);
    expect(invoice.amount.toFixed(2)).toBe("129.70");
    expect(invoice.taxableAmount.toFixed(2)).toBe("110.00");
    expect(invoice.taxAmount.toFixed(2)).toBe("19.70");
  });

  it("splits input VAT on a mixed bill and reverses a mixed credit note per rule", async () => {
    const bill = await accounting.createBill(de.organizationId, { supplierName: "Großhandel AG", expenseAccountId: expenseId, lines: mixedLines(), billDate: new Date("2026-11-06"), dueDate: new Date("2026-12-06"), taxRuleId: standard, pricesIncludeTax: false }, de.userId);
    expect(bill.taxAmount.toFixed(2)).toBe("22.50");
    await accounting.approveBill(de.organizationId, bill.id, de.userId);
    const approved = await journal(de.organizationId, "ACCOUNTING_BILL", bill.id);
    expect(balanced(approved)).toBe(true);
    expect(amountOn(approved, "1300", "debit")).toBe("22.50");
    expect(amountOn(approved, "2000", "credit")).toBe("212.50");

    const invoice = await accounting.createInvoice(de.organizationId, { customerName: "Leipzig Schule", lines: mixedLines(), issueDate: new Date("2026-11-07"), dueDate: new Date("2026-12-07"), taxRuleId: standard, pricesIncludeTax: false }, de.userId);
    await accounting.markInvoiceSent(de.organizationId, invoice.id);
    const before = (await getTaxReport(de.organizationId, { from: "2026-01-01", to: "2030-12-31", view: "jurisdiction" })).rows.find((row) => row.key === "EU-DE")!;
    const credit = await accounting.createCreditNote(de.organizationId, { customerName: "Leipzig Schule", lines: [{ description: "Books returned", quantity: "1", unitPrice: "25.00", taxRuleId: reduced }, { description: "Printer discount", quantity: "1", unitPrice: "10.00" }], issueDate: new Date("2026-11-08"), taxRuleId: standard, pricesIncludeTax: false }, de.userId);
    expect(credit.taxAmount.toFixed(2)).toBe("3.65"); // 7% of 25 + 19% of 10
    await accounting.applyCreditNoteToInvoice(de.organizationId, credit.id, invoice.id, de.userId);
    const settled = await journal(de.organizationId, "ACCOUNTING_CREDIT_NOTE", credit.id);
    expect(balanced(settled)).toBe(true);
    expect(amountOn(settled, "2100", "debit")).toBe("3.65");
    const after = (await getTaxReport(de.organizationId, { from: "2026-01-01", to: "2030-12-31", view: "jurisdiction" })).rows.find((row) => row.key === "EU-DE")!;
    expect(before.netPayable.minus(after.netPayable).toFixed(2)).toBe("3.65");
  }, 90_000);

  it("requires a document rule and never resolves another organization's rule on a line", async () => {
    await expect(accounting.createInvoice(de.organizationId, { customerName: "No rule", lines: [{ description: "Books", quantity: "1", unitPrice: "10.00", taxRuleId: reduced }], issueDate: new Date("2026-11-09"), dueDate: new Date("2026-12-09") }, de.userId)).rejects.toThrow(/tax rule for the document/);
    await provisionJurisdictionPack(other.organizationId, "EU", other.userId).catch(() => undefined);
    await expect(accounting.createInvoice(other.organizationId, { customerName: "Cross tenant", lines: [{ description: "Books", quantity: "1", unitPrice: "10.00", taxRuleId: reduced }], issueDate: new Date("2026-11-09"), dueDate: new Date("2026-12-09"), taxRuleId: (await testDb.taxRule.findFirst({ where: { organizationId: other.organizationId } }))?.id ?? standard }, other.userId)).rejects.toThrow(/not found/);
    expect(await testDb.accountingInvoice.count({ where: { organizationId: other.organizationId } })).toBe(0);
  }, 60_000);
});
