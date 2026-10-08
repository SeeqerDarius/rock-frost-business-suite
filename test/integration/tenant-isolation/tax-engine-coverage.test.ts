import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import * as accounting from "@/modules/accounting/service";
import { createSupplierInvoice, reviewSupplierInvoice } from "@/modules/procurement/service";
import { provisionJurisdictionPack } from "@/modules/tax/service";
import { testDb } from "../setup/db";
import { addSecondTestMember, cleanupTestOrg, createTestOrg, type TestOrg } from "../setup/fixtures";

let gh: TestOrg;
let other: TestOrg;
let reviewerId: string;
let ruleId: string;
let taxCodeId: string;

const line = (unitPrice: string) => [{ description: "Taxable service", quantity: "1", unitPrice }];

async function journal(orgId: string, sourceType: string, sourceId: string) {
  return testDb.accountingJournalEntry.findFirstOrThrow({ where: { organizationId: orgId, sourceType, sourceId }, include: { lines: { include: { account: true } } } });
}
const amountOn = (entry: Awaited<ReturnType<typeof journal>>, code: string, side: "debit" | "credit") =>
  entry.lines.filter((l) => l.account.code === code).reduce((sum, l) => sum.plus(l[side]), new Prisma.Decimal(0)).toFixed(2);
const balanced = (entry: Awaited<ReturnType<typeof journal>>) =>
  entry.lines.reduce((sum, l) => sum.plus(l.debit), new Prisma.Decimal(0)).toFixed(2) === entry.lines.reduce((sum, l) => sum.plus(l.credit), new Prisma.Decimal(0)).toFixed(2);
const sum = (rows: { taxAmount: Prisma.Decimal }[]) => rows.reduce((total, row) => total.plus(row.taxAmount), new Prisma.Decimal(0)).toFixed(2);

async function receivedOrder(org: TestOrg, unitCost: string) {
  const vendor = await testDb.procurementVendor.create({ data: { organizationId: org.organizationId, name: `Vendor ${Math.random().toString(36).slice(2, 8)}` } });
  const order = await testDb.procurementOrder.create({
    data: { organizationId: org.organizationId, orderNumber: `PO-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, vendorId: vendor.id, orderDate: new Date("2026-11-01"), status: "RECEIVED", lines: { create: [{ description: "Cement bags", quantity: 10, unitCost: new Prisma.Decimal(unitCost), receivedQuantity: 10 }] } },
    include: { lines: true },
  });
  return { vendor, order };
}

beforeAll(async () => {
  gh = await createTestOrg("tax-coverage-gh");
  other = await createTestOrg("tax-coverage-other");
  await testDb.organization.update({ where: { id: gh.organizationId }, data: { currency: "GHS", country: "GH", jurisdictionCode: "GH" } });
  await provisionJurisdictionPack(gh.organizationId, "GH", gh.userId);
  ruleId = (await testDb.taxRule.findFirstOrThrow({ where: { organizationId: gh.organizationId, code: "GH-STANDARD" } })).id;
  await accounting.ensureDefaultAccounts(gh.organizationId);
  taxCodeId = (await testDb.accountingTaxCode.create({ data: { organizationId: gh.organizationId, code: `STD-${Date.now()}`, name: "Standard VAT", jurisdiction: "GH", treatment: "STANDARD", vatRate: new Prisma.Decimal("15"), nhilRate: new Prisma.Decimal("2.5"), getfundRate: new Prisma.Decimal("2.5"), effectiveFrom: new Date("2026-01-01") } })).id;
  reviewerId = (await addSecondTestMember(gh, "tax-coverage-reviewer")).userId;
}, 120_000);

afterAll(async () => {
  await cleanupTestOrg(gh);
  await cleanupTestOrg(other);
});

describe("credit notes and output tax (real Postgres)", () => {
  it("records a legacy credit note's tax reduction in the working return and the tax ledger", async () => {
    const invoice = await accounting.createInvoice(gh.organizationId, { customerName: "Accra Retail", lines: line("200.00"), issueDate: new Date("2026-11-05"), dueDate: new Date("2026-12-05"), taxCodeId }, gh.userId);
    await accounting.markInvoiceSent(gh.organizationId, invoice.id);
    const creditNote = await accounting.createCreditNote(gh.organizationId, { customerName: "Accra Retail", lines: line("50.00"), issueDate: new Date("2026-11-06"), taxCodeId }, gh.userId);
    await accounting.applyCreditNoteToInvoice(gh.organizationId, creditNote.id, invoice.id, gh.userId);
    const transaction = await testDb.accountingTaxTransaction.findFirstOrThrow({ where: { organizationId: gh.organizationId, sourceType: "ACCOUNTING_CREDIT_NOTE", sourceId: creditNote.id } });
    expect(transaction).toMatchObject({ direction: "ADJUSTMENT" });
    expect(transaction.vatAmount.toFixed(2)).toBe("-7.50");
    expect(transaction.taxableAmount.toFixed(2)).toBe("-50.00");
    const ledger = await testDb.taxLedgerEntry.findMany({ where: { organizationId: gh.organizationId, sourceType: "ACCOUNTING_CREDIT_NOTE", sourceId: creditNote.id } });
    expect(sum(ledger)).toBe("-10.00");
  }, 60_000);

  it("taxes an engine credit note from its own snapshot and reverses each component on application", async () => {
    const invoice = await accounting.createInvoice(gh.organizationId, { customerName: "Tema Hardware", lines: line("100.00"), issueDate: new Date("2026-11-10"), dueDate: new Date("2026-12-10"), taxRuleId: ruleId }, gh.userId);
    await accounting.markInvoiceSent(gh.organizationId, invoice.id);
    const creditNote = await accounting.createCreditNote(gh.organizationId, { customerName: "Tema Hardware", lines: line("40.00"), issueDate: new Date("2026-11-12"), taxRuleId: ruleId, pricesIncludeTax: false }, gh.userId);
    expect(creditNote).toMatchObject({ taxRuleId: ruleId, taxTreatment: "STANDARD" });
    expect(creditNote.taxAmount.toFixed(2)).toBe("8.00");
    expect(creditNote.amount.toFixed(2)).toBe("48.00");
    expect(creditNote.vatAmount.toFixed(2)).toBe("0.00");
    const snapshot = await testDb.documentTaxLine.findMany({ where: { organizationId: gh.organizationId, documentType: "CREDIT_NOTE", documentId: creditNote.id } });
    expect(snapshot.map((row) => [row.code, row.taxAmount.toFixed(2)]).sort()).toEqual([["GH-GETFUND", "1.00"], ["GH-NHIL", "1.00"], ["GH-VAT", "6.00"]]);

    await accounting.applyCreditNoteToInvoice(gh.organizationId, creditNote.id, invoice.id, gh.userId);
    const entry = await journal(gh.organizationId, "ACCOUNTING_CREDIT_NOTE", creditNote.id);
    expect(balanced(entry)).toBe(true);
    expect(amountOn(entry, "4000", "debit")).toBe("40.00");
    expect(amountOn(entry, "2100", "debit")).toBe("6.00");
    expect(amountOn(entry, "2110", "debit")).toBe("1.00");
    expect(amountOn(entry, "2120", "debit")).toBe("1.00");
    expect(amountOn(entry, "1100", "credit")).toBe("48.00");
    const ledger = await testDb.taxLedgerEntry.findMany({ where: { organizationId: gh.organizationId, sourceType: "ACCOUNTING_CREDIT_NOTE", sourceId: creditNote.id } });
    expect(ledger.every((row) => row.direction === "ADJUSTMENT")).toBe(true);
    expect(sum(ledger)).toBe("-8.00");
    const updated = await testDb.accountingInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(updated.amountCredited.toFixed(2)).toBe("48.00");
    await expect(accounting.applyCreditNoteToInvoice(gh.organizationId, creditNote.id, invoice.id, gh.userId)).rejects.toThrow();
  }, 60_000);

  it("refunds an engine credit note to a cash account and reverses its tax", async () => {
    const cash = (await accounting.ensureDefaultAccounts(gh.organizationId)).find((account) => account.liquidityType === "CASH")!;
    const creditNote = await accounting.createCreditNote(gh.organizationId, { customerName: "Walk-in customer", lines: line("120.00"), issueDate: new Date("2026-11-15"), taxRuleId: ruleId, pricesIncludeTax: true }, gh.userId);
    // Inclusive pricing: 120.00 gross is 100.00 taxable plus 20.00 tax.
    expect(creditNote.amount.toFixed(2)).toBe("120.00");
    expect(creditNote.taxableAmount.toFixed(2)).toBe("100.00");
    await accounting.refundCreditNote(gh.organizationId, creditNote.id, cash.id, gh.userId);
    const entry = await journal(gh.organizationId, "ACCOUNTING_CREDIT_NOTE", creditNote.id);
    expect(balanced(entry)).toBe(true);
    expect(amountOn(entry, cash.code, "credit")).toBe("120.00");
    expect(sum(await testDb.taxLedgerEntry.findMany({ where: { organizationId: gh.organizationId, sourceId: creditNote.id } }))).toBe("-20.00");
  }, 60_000);

  it("never applies a credit note across organizations", async () => {
    const creditNote = await accounting.createCreditNote(gh.organizationId, { customerName: "Isolated", lines: line("10.00"), issueDate: new Date("2026-11-15"), taxRuleId: ruleId }, gh.userId);
    const foreignInvoice = await accounting.createInvoice(other.organizationId, { customerName: "Other org", lines: line("100.00"), issueDate: new Date("2026-11-10"), dueDate: new Date("2026-12-10") }, other.userId);
    await expect(accounting.applyCreditNoteToInvoice(gh.organizationId, creditNote.id, foreignInvoice.id, gh.userId)).rejects.toThrow(accounting.NotFoundError);
    await expect(accounting.createCreditNote(other.organizationId, { customerName: "Wrong rule", lines: line("10.00"), issueDate: new Date("2026-11-15"), taxRuleId: ruleId }, other.userId)).rejects.toThrow();
  }, 60_000);
});

describe("Procurement supplier invoices and input tax (real Postgres)", () => {
  it("taxes an engine supplier invoice and posts recoverable input tax per component on approval", async () => {
    const { vendor, order } = await receivedOrder(gh, "50.00");
    const invoice = await createSupplierInvoice(gh.organizationId, { vendorId: vendor.id, orderId: order.id, invoiceNumber: "SUP-ENGINE-1", invoiceDate: new Date("2026-11-20"), taxRuleId: ruleId, createdById: gh.userId, lines: [{ orderLineId: order.lines[0].id, quantity: 10, unitCost: "50.00" }] });
    expect(invoice).toMatchObject({ taxRuleId: ruleId, taxTreatment: "STANDARD", status: "MATCHED" });
    expect(invoice.taxableAmount.toFixed(2)).toBe("500.00");
    expect(invoice.taxAmount.toFixed(2)).toBe("100.00");
    expect(invoice.totalAmount.toFixed(2)).toBe("600.00");
    expect(await testDb.documentTaxLine.count({ where: { organizationId: gh.organizationId, documentType: "SUPPLIER_INVOICE", documentId: invoice.id } })).toBe(3);

    await reviewSupplierInvoice(gh.organizationId, invoice.id, reviewerId, "APPROVE");
    const entry = await journal(gh.organizationId, "PROCUREMENT_SUPPLIER_INVOICE", invoice.id);
    expect(balanced(entry)).toBe(true);
    expect(amountOn(entry, "1200", "debit")).toBe("500.00");
    expect(amountOn(entry, "1300", "debit")).toBe("75.00");
    expect(amountOn(entry, "1310", "debit")).toBe("12.50");
    expect(amountOn(entry, "1320", "debit")).toBe("12.50");
    expect(amountOn(entry, "2000", "credit")).toBe("600.00");
    const ledger = await testDb.taxLedgerEntry.findMany({ where: { organizationId: gh.organizationId, sourceType: "PROCUREMENT_SUPPLIER_INVOICE", sourceId: invoice.id } });
    expect(ledger.every((row) => row.direction === "INPUT")).toBe(true);
    expect(sum(ledger)).toBe("100.00");
  }, 60_000);

  it("adds a legacy supplier invoice's input tax to the tax ledger", async () => {
    const { vendor, order } = await receivedOrder(gh, "20.00");
    const invoice = await createSupplierInvoice(gh.organizationId, { vendorId: vendor.id, orderId: order.id, invoiceNumber: "SUP-LEGACY-1", invoiceDate: new Date("2026-11-21"), taxCodeId, createdById: gh.userId, lines: [{ orderLineId: order.lines[0].id, quantity: 10, unitCost: "20.00" }] });
    await reviewSupplierInvoice(gh.organizationId, invoice.id, reviewerId, "APPROVE");
    const ledger = await testDb.taxLedgerEntry.findMany({ where: { organizationId: gh.organizationId, sourceType: "PROCUREMENT_SUPPLIER_INVOICE", sourceId: invoice.id } });
    expect(ledger.length).toBeGreaterThan(0);
    expect(sum(ledger)).toBe("40.00");
  }, 60_000);

  it("rejects a tax code and a tax rule together, and a rule from another organization", async () => {
    const { vendor, order } = await receivedOrder(gh, "10.00");
    await expect(createSupplierInvoice(gh.organizationId, { vendorId: vendor.id, orderId: order.id, invoiceNumber: "SUP-BOTH", invoiceDate: new Date("2026-11-22"), taxCodeId, taxRuleId: ruleId, lines: [{ orderLineId: order.lines[0].id, quantity: 1, unitCost: "10.00" }] })).rejects.toThrow(/either/);
    const foreign = await receivedOrder(other, "10.00");
    await expect(createSupplierInvoice(other.organizationId, { vendorId: foreign.vendor.id, orderId: foreign.order.id, invoiceNumber: "SUP-FOREIGN-RULE", invoiceDate: new Date("2026-11-22"), taxRuleId: ruleId, lines: [{ orderLineId: foreign.order.lines[0].id, quantity: 1, unitCost: "10.00" }] })).rejects.toThrow();
  }, 60_000);
});
