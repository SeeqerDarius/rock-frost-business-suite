import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import * as accounting from "@/modules/accounting/service";
import { postRevaluation, previewRevaluation } from "@/modules/accounting/revaluation";
import { recordExchangeRate } from "@/modules/globalization/exchange-rates";
import { testDb } from "../setup/db";
import { cleanupTestOrg, createTestOrg, type TestOrg } from "../setup/fixtures";

let org: TestOrg;
let other: TestOrg;
let cashId: string;
let expenseId: string;

const line = (unitPrice: string) => [{ description: "Freight services", quantity: "1", unitPrice }];

async function journalFor(sourceType: string, sourceId: string, postingPurpose?: string) {
  return testDb.accountingJournalEntry.findFirstOrThrow({
    where: { organizationId: org.organizationId, sourceType, sourceId, ...(postingPurpose ? { postingPurpose } : {}) },
    include: { lines: { include: { account: true } } },
  });
}

function amountOn(entry: Awaited<ReturnType<typeof journalFor>>, code: string, side: "debit" | "credit") {
  return entry.lines.filter((l) => l.account.code === code).reduce((sum, l) => sum.plus(l[side]), new Prisma.Decimal(0)).toFixed(2);
}

function expectBalanced(entry: Awaited<ReturnType<typeof journalFor>>) {
  const debit = entry.lines.reduce((sum, l) => sum.plus(l.debit), new Prisma.Decimal(0));
  const credit = entry.lines.reduce((sum, l) => sum.plus(l.credit), new Prisma.Decimal(0));
  expect(debit.toFixed(2)).toBe(credit.toFixed(2));
}

beforeAll(async () => {
  org = await createTestOrg("multi-currency");
  other = await createTestOrg("multi-currency-other");
  await testDb.organization.update({ where: { id: org.organizationId }, data: { currency: "GHS", country: "GH", jurisdictionCode: "GH" } });
  const accounts = await accounting.ensureDefaultAccounts(org.organizationId);
  cashId = accounts.find((a) => a.code === "1000")!.id;
  expenseId = accounts.find((a) => a.code === "5000")!.id;
  for (const [rate, date] of [["15.00", "2026-09-01"], ["16.00", "2026-09-20"]] as const) {
    await recordExchangeRate({ organizationId: org.organizationId, actorId: org.userId, fromCurrency: "USD", toCurrency: "GHS", rate, rateDate: date });
  }
  await recordExchangeRate({ organizationId: org.organizationId, actorId: org.userId, fromCurrency: "EUR", toCurrency: "GHS", rate: "17.00", rateDate: "2026-09-01" });
}, 60_000);

afterAll(async () => {
  await cleanupTestOrg(org);
  await cleanupTestOrg(other);
});

describe("foreign-currency receivables (real Postgres)", () => {
  it("snapshots the rate at creation, posts base amounts, and books a realized gain on collection", async () => {
    const invoice = await accounting.createInvoice(org.organizationId, { customerName: "Atlanta Importers", lines: line("100.00"), issueDate: new Date("2026-09-05"), dueDate: new Date("2026-10-05"), currency: "USD" }, org.userId);
    expect(invoice.currency).toBe("USD");
    expect(invoice.amount.toFixed(2)).toBe("100.00");
    expect(invoice.exchangeRate.toFixed(2)).toBe("15.00");
    expect(invoice.baseAmount?.toFixed(2)).toBe("1500.00");

    await accounting.markInvoiceSent(org.organizationId, invoice.id);
    const sent = await journalFor("INVOICE", invoice.id);
    expect(amountOn(sent, "1100", "debit")).toBe("1500.00");
    expect(amountOn(sent, "4000", "credit")).toBe("1500.00");
    const arLine = sent.lines.find((l) => l.account.code === "1100")!;
    expect(arLine.transactionCurrency).toBe("USD");
    expect(arLine.transactionAmount?.toFixed(2)).toBe("100.00");
    const taxEvidence = await testDb.accountingTaxTransaction.findFirstOrThrow({ where: { organizationId: org.organizationId, sourceId: invoice.id } });
    expect(taxEvidence.taxableAmount.toFixed(2)).toBe("1500.00");
    expect(taxEvidence.currency).toBe("USD");

    const { payment } = await accounting.recordInvoicePayment(org.organizationId, invoice.id, { amount: "100.00", paymentDate: new Date("2026-09-25"), accountId: cashId, paymentMethod: "BANK_TRANSFER", createdById: org.userId });
    expect(payment?.exchangeRate.toFixed(2)).toBe("16.00");
    expect(payment?.realizedFxAmount.toFixed(2)).toBe("100.00");
    const received = await journalFor("ACCOUNTING_RECEIVABLE_PAYMENT", payment!.id);
    expectBalanced(received);
    expect(amountOn(received, "1000", "debit")).toBe("1600.00");
    expect(amountOn(received, "1100", "credit")).toBe("1500.00");
    expect(amountOn(received, "4810", "credit")).toBe("100.00");

    const paid = await testDb.accountingInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(paid.status).toBe("PAID");
    expect(paid.baseAmountSettled.toFixed(2)).toBe("1500.00");
    // The historical document rate is unchanged by the newer recorded rate.
    expect(paid.exchangeRate.toFixed(2)).toBe("15.00");
  }, 60_000);

  it("leaves no rounding residue on the receivable after partial payments", async () => {
    const invoice = await accounting.createInvoice(org.organizationId, { customerName: "Rounding Customer", lines: line("100.00"), issueDate: new Date("2026-09-06"), dueDate: new Date("2026-10-06"), currency: "USD", exchangeRate: "15.333333" }, org.userId);
    expect(invoice.exchangeRateSource).toBe("MANUAL_ENTRY");
    expect(invoice.baseAmount?.toFixed(2)).toBe("1533.33");
    await accounting.markInvoiceSent(org.organizationId, invoice.id);
    await accounting.recordInvoicePayment(org.organizationId, invoice.id, { amount: "33.33", paymentDate: new Date("2026-09-07"), accountId: cashId, paymentMethod: "CASH", exchangeRate: "15.333333" });
    await accounting.recordInvoicePayment(org.organizationId, invoice.id, { amount: "66.67", paymentDate: new Date("2026-09-08"), accountId: cashId, paymentMethod: "CASH", exchangeRate: "15.333333" });
    const settled = await testDb.accountingInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(settled.status).toBe("PAID");
    expect(settled.baseAmountSettled.toFixed(2)).toBe("1533.33");
  }, 60_000);

  it("reverses exactly the posted base amounts when a foreign invoice is voided", async () => {
    const invoice = await accounting.createInvoice(org.organizationId, { customerName: "Void Customer", lines: line("50.00"), issueDate: new Date("2026-09-10"), dueDate: new Date("2026-10-10"), currency: "USD" }, org.userId);
    await accounting.markInvoiceSent(org.organizationId, invoice.id);
    await accounting.voidInvoice(org.organizationId, invoice.id);
    const sent = await journalFor("INVOICE", invoice.id);
    const voided = await journalFor("INVOICE_VOID", invoice.id);
    expect(amountOn(voided, "1100", "credit")).toBe(amountOn(sent, "1100", "debit"));
    expect(amountOn(voided, "4000", "debit")).toBe("750.00");
  }, 60_000);

  it("rejects a cash account held in another foreign currency and a mismatched credit note", async () => {
    const eurBank = await accounting.createAccount(org.organizationId, { code: "1015", name: "EUR Bank", type: "ASSET", liquidityType: "BANK", currency: "EUR" });
    const invoice = await accounting.createInvoice(org.organizationId, { customerName: "Guard Customer", lines: line("10.00"), issueDate: new Date("2026-09-11"), dueDate: new Date("2026-10-11"), currency: "USD" }, org.userId);
    await accounting.markInvoiceSent(org.organizationId, invoice.id);
    await expect(accounting.recordInvoicePayment(org.organizationId, invoice.id, { amount: "10.00", paymentDate: new Date("2026-09-12"), accountId: eurBank.id, paymentMethod: "BANK_TRANSFER" })).rejects.toThrow(/held in EUR/);

    const eurCredit = await accounting.createCreditNote(org.organizationId, { customerName: "Guard Customer", lines: line("5.00"), issueDate: new Date("2026-09-12"), currency: "EUR" }, org.userId);
    await expect(accounting.applyCreditNoteToInvoice(org.organizationId, eurCredit.id, invoice.id, org.userId)).rejects.toThrow(/cannot be applied/);

    const usdCredit = await accounting.createCreditNote(org.organizationId, { customerName: "Guard Customer", lines: line("4.00"), issueDate: new Date("2026-09-25"), currency: "USD" }, org.userId);
    await accounting.applyCreditNoteToInvoice(org.organizationId, usdCredit.id, invoice.id, org.userId);
    const applied = await journalFor("ACCOUNTING_CREDIT_NOTE", usdCredit.id, "APPLIED");
    expectBalanced(applied);
    // Posted at the invoice's booked rate (15), not the credit note's date rate (16).
    expect(amountOn(applied, "1100", "credit")).toBe("60.00");
  }, 60_000);
});

describe("foreign-currency payables (real Postgres)", () => {
  it("books a realized gain when a EUR bill is paid at a lower rate", async () => {
    const bill = await accounting.createBill(org.organizationId, { supplierName: "Hamburg Parts GmbH", expenseAccountId: expenseId, lines: line("200.00"), billDate: new Date("2026-09-05"), dueDate: new Date("2026-10-05"), currency: "EUR" }, org.userId);
    expect(bill.baseAmount?.toFixed(2)).toBe("3400.00");
    await accounting.approveBill(org.organizationId, bill.id, org.userId);
    const approved = await journalFor("ACCOUNTING_BILL", bill.id, "APPROVED");
    expect(amountOn(approved, "2000", "credit")).toBe("3400.00");

    const { payment } = await accounting.recordBillPayment(org.organizationId, bill.id, { amount: "200.00", paymentDate: new Date("2026-09-15"), accountId: cashId, paymentMethod: "BANK_TRANSFER", exchangeRate: "16.50", createdById: org.userId });
    const paid = await journalFor("ACCOUNTING_PAYABLE_PAYMENT", payment.id, "PAID");
    expectBalanced(paid);
    expect(amountOn(paid, "2000", "debit")).toBe("3400.00");
    expect(amountOn(paid, "1000", "credit")).toBe("3300.00");
    expect(amountOn(paid, "4810", "credit")).toBe("100.00");
  }, 60_000);
});

describe("unrealized revaluation (real Postgres)", () => {
  it("revalues open foreign balances at the closing rate and reverses the next day", async () => {
    const invoice = await accounting.createInvoice(org.organizationId, { customerName: "Open Balance Customer", lines: line("100.00"), issueDate: new Date("2026-09-15"), dueDate: new Date("2026-11-15"), currency: "USD" }, org.userId);
    await accounting.markInvoiceSent(org.organizationId, invoice.id);
    await recordExchangeRate({ organizationId: org.organizationId, actorId: org.userId, fromCurrency: "USD", toCurrency: "GHS", rate: "16.50", rateDate: "2026-09-30" });

    const preview = await previewRevaluation(org.organizationId, "2026-09-30");
    const row = preview.lines.find((l) => l.documentId === invoice.id)!;
    expect(row.carryingBase.toFixed(2)).toBe("1500.00");
    expect(row.revaluedBase?.toFixed(2)).toBe("1650.00");
    expect(row.difference?.toFixed(2)).toBe("150.00");

    const { entry, reversal } = await postRevaluation(org.organizationId, "2026-09-30", org.userId);
    const revalued = await journalFor("FX_REVALUATION", entry.sourceId!, "REVALUED");
    const reversed = await journalFor("FX_REVALUATION", reversal.sourceId!, "REVERSED");
    expectBalanced(revalued);
    expectBalanced(reversed);
    expect(reversed.entryDate.toISOString().slice(0, 10)).toBe("2026-10-01");
    expect(amountOn(revalued, "1100", "debit")).toBe(amountOn(reversed, "1100", "credit"));
    await expect(postRevaluation(org.organizationId, "2026-09-30", org.userId)).rejects.toThrow(/already posted/);

    // The document itself is untouched.
    const unchanged = await testDb.accountingInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(unchanged.exchangeRate.toFixed(2)).toBe("15.00");
    expect(unchanged.baseAmountSettled.toFixed(2)).toBe("0.00");
  }, 60_000);
});

describe("base-currency regression and tenant isolation (real Postgres)", () => {
  it("posts a base-currency invoice exactly as before, at rate 1", async () => {
    const invoice = await accounting.createInvoice(org.organizationId, { customerName: "Accra Customer", lines: line("120.00"), issueDate: new Date("2026-09-05"), dueDate: new Date("2026-10-05") }, org.userId);
    expect(invoice.currency).toBe("GHS");
    expect(invoice.exchangeRate.toFixed(0)).toBe("1");
    expect(invoice.baseAmount?.toFixed(2)).toBe("120.00");
    await accounting.markInvoiceSent(org.organizationId, invoice.id);
    const sent = await journalFor("INVOICE", invoice.id);
    expect(amountOn(sent, "1100", "debit")).toBe("120.00");
    expect(sent.lines.every((l) => l.transactionCurrency === null)).toBe(true);
    const { payment } = await accounting.recordInvoicePayment(org.organizationId, invoice.id, { amount: "120.00", paymentDate: new Date("2026-09-06"), accountId: cashId, paymentMethod: "CASH" });
    const received = await journalFor("ACCOUNTING_RECEIVABLE_PAYMENT", payment!.id);
    expect(received.lines).toHaveLength(2);
  }, 60_000);

  it("never uses another organization's exchange rates", async () => {
    await expect(accounting.createInvoice(other.organizationId, { customerName: "Isolated", lines: line("10.00"), issueDate: new Date("2026-09-05"), dueDate: new Date("2026-10-05"), currency: "USD" }, other.userId)).rejects.toThrow(/No USD to/);
    const preview = await previewRevaluation(other.organizationId, "2026-09-30");
    expect(preview.lines).toHaveLength(0);
  }, 60_000);
});
