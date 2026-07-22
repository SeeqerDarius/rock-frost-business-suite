import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as accounting from "@/modules/accounting/service";
import { testDb } from "../setup/db";
import { createTestOrg, cleanupTestOrg, type TestOrg } from "../setup/fixtures";

/**
 * Real-Postgres concurrency coverage for src/modules/accounting/service.ts
 * (Hardening Pass 4, Milestone B). Every test fires genuinely concurrent
 * requests (Promise.all / Promise.allSettled) into the same service
 * function against the same underlying rows, and asserts the final
 * committed state in the database is correct.
 */

let orgOverpay: TestOrg;
let orgExactPay: TestOrg;
let orgSend: TestOrg;
let orgInvoiceNumbers: TestOrg;

beforeAll(async () => {
  orgOverpay = await createTestOrg("orgOverpay-accounting");
  orgExactPay = await createTestOrg("orgExactPay-accounting");
  orgSend = await createTestOrg("orgSend-accounting");
  orgInvoiceNumbers = await createTestOrg("orgInvoiceNumbers-accounting");

  await accounting.ensureDefaultAccounts(orgOverpay.organizationId);
  await accounting.ensureDefaultAccounts(orgExactPay.organizationId);
  await accounting.ensureDefaultAccounts(orgSend.organizationId);
  await accounting.ensureDefaultAccounts(orgInvoiceNumbers.organizationId);
});

afterAll(async () => {
  await cleanupTestOrg(orgOverpay);
  await cleanupTestOrg(orgExactPay);
  await cleanupTestOrg(orgSend);
  await cleanupTestOrg(orgInvoiceNumbers);
});

async function createSentInvoice(organizationId: string, amount: string) {
  const invoice = await accounting.createInvoice(organizationId, {
    customerName: "Concurrency Test Customer",
    amount,
    issueDate: new Date("2026-01-01"),
    dueDate: new Date("2026-02-01"),
  });
  return accounting.markInvoiceSent(organizationId, invoice.id);
}

describe("Accounting concurrency (real Postgres)", () => {
  it("two concurrent payments that together would overpay: exactly one succeeds, amountPaid reflects only the winner", async () => {
    const invoice = await createSentInvoice(orgOverpay.organizationId, "100.00");

    const results = await Promise.allSettled([
      accounting.recordInvoicePayment(orgOverpay.organizationId, invoice.id, "60.00", new Date("2026-01-15")),
      accounting.recordInvoicePayment(orgOverpay.organizationId, invoice.id, "60.00", new Date("2026-01-15")),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(accounting.InvalidPaymentError);

    const finalInvoice = await testDb.accountingInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(finalInvoice.amountPaid.toString()).toBe("60.00");
    expect(finalInvoice.status).toBe("SENT");
  });

  it("two concurrent payments that together exactly fit both succeed, amountPaid is exact, invoice is PAID", async () => {
    const invoice = await createSentInvoice(orgExactPay.organizationId, "100.00");

    const [resultA, resultB] = await Promise.all([
      accounting.recordInvoicePayment(orgExactPay.organizationId, invoice.id, "50.00", new Date("2026-01-15")),
      accounting.recordInvoicePayment(orgExactPay.organizationId, invoice.id, "50.00", new Date("2026-01-15")),
    ]);

    expect(resultA).toBeTruthy();
    expect(resultB).toBeTruthy();

    const finalInvoice = await testDb.accountingInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(finalInvoice.amountPaid.toString()).toBe("100.00");
    expect(finalInvoice.status).toBe("PAID");
  });

  it("two concurrent markInvoiceSent calls on the same DRAFT invoice: exactly one succeeds, exactly one journal entry posted", async () => {
    const invoice = await accounting.createInvoice(orgSend.organizationId, {
      customerName: "Send Race Customer",
      amount: "75.00",
      issueDate: new Date("2026-01-01"),
      dueDate: new Date("2026-02-01"),
    });

    const results = await Promise.allSettled([
      accounting.markInvoiceSent(orgSend.organizationId, invoice.id),
      accounting.markInvoiceSent(orgSend.organizationId, invoice.id),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(accounting.InvoiceStateError);

    const finalInvoice = await testDb.accountingInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(finalInvoice.status).toBe("SENT");

    const journalEntryCount = await testDb.accountingJournalEntry.count({
      where: { organizationId: orgSend.organizationId, sourceType: "INVOICE", sourceId: invoice.id },
    });
    expect(journalEntryCount).toBe(1);
  });

  it("two concurrent createInvoice calls both succeed with distinct invoice numbers", async () => {
    const invoiceInput = {
      customerName: "Invoice Number Race Customer",
      amount: "20.00",
      issueDate: new Date("2026-01-01"),
      dueDate: new Date("2026-02-01"),
    };

    const [invoiceA, invoiceB] = await Promise.all([
      accounting.createInvoice(orgInvoiceNumbers.organizationId, invoiceInput),
      accounting.createInvoice(orgInvoiceNumbers.organizationId, invoiceInput),
    ]);

    expect(invoiceA.invoiceNumber).not.toBe(invoiceB.invoiceNumber);

    const count = await testDb.accountingInvoice.count({ where: { organizationId: orgInvoiceNumbers.organizationId } });
    expect(count).toBe(2);
  });
});
