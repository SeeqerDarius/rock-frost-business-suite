import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as accounting from "@/modules/accounting/service";
import { testDb } from "../setup/db";
import { createTestOrg, cleanupTestOrg, type TestOrg } from "../setup/fixtures";

/**
 * Real-Postgres equivalent of the accounting block in
 * test/pass2-financial-inventory-integrity.test.ts — proves
 * postJournalEntry's account-ownership check (the single choke point every
 * journal-posting call site goes through) and the invoice/expense findFirst
 * scoping against a real Prisma/Postgres stack, not a mocked db.
 */

let orgA: TestOrg;
let orgB: TestOrg;

let orgAAccountId: string;
let orgBAccountId: string;

let orgBInvoiceId: string;
let orgBExpenseId: string;

beforeAll(async () => {
  orgA = await createTestOrg("orgA-accounting");
  orgB = await createTestOrg("orgB-accounting");

  const orgAAccounts = await accounting.ensureDefaultAccounts(orgA.organizationId);
  const orgACash = orgAAccounts.find((a) => a.code === "1000");
  if (!orgACash) throw new Error("Org A default Cash account (1000) was not created.");
  orgAAccountId = orgACash.id;

  const orgBAccounts = await accounting.ensureDefaultAccounts(orgB.organizationId);
  const orgBCash = orgBAccounts.find((a) => a.code === "1000");
  if (!orgBCash) throw new Error("Org B default Cash account (1000) was not created.");
  orgBAccountId = orgBCash.id;

  const orgBInvoice = await accounting.createInvoice(orgB.organizationId, {
    customerName: "Org B Customer",
    lines: [{ description: "Org B test line", quantity: "1", unitPrice: "100.00" }],
    issueDate: new Date(),
    dueDate: new Date(),
  });
  orgBInvoiceId = orgBInvoice.id;

  const orgBExpense = await accounting.createExpense(orgB.organizationId, {
    vendorName: "Org B Vendor",
    amount: "50.00",
    expenseDate: new Date(),
  });
  orgBExpenseId = orgBExpense.id;
});

afterAll(async () => {
  await cleanupTestOrg(orgA);
  await cleanupTestOrg(orgB);
});

describe("Accounting tenant isolation (real Postgres)", () => {
  it("createManualJournalEntry rejects a balanced entry with a line referencing another organization's account", async () => {
    await expect(
      accounting.createManualJournalEntry(orgA.organizationId, {
        entryDate: new Date(),
        description: "Cross-tenant journal entry",
        lines: [
          { accountId: orgAAccountId, debit: "100.00" },
          { accountId: orgBAccountId, credit: "100.00" },
        ],
      }),
    ).rejects.toThrow(accounting.NotFoundError);
  });

  it("createManualJournalEntry succeeds when every line references only Org A's own accounts (sanity check)", async () => {
    const revenue = (await accounting.ensureDefaultAccounts(orgA.organizationId)).find((a) => a.code === "4000");
    if (!revenue) throw new Error("Org A default Revenue account (4000) was not created.");

    const entry = await accounting.createManualJournalEntry(orgA.organizationId, {
      entryDate: new Date(),
      description: "Same-tenant journal entry",
      lines: [
        { accountId: orgAAccountId, debit: "25.00" },
        { accountId: revenue.id, credit: "25.00" },
      ],
    });
    expect(entry.organizationId).toBe(orgA.organizationId);
  });

  it("recordInvoicePayment rejects an invoice id belonging to another organization", async () => {
    await expect(
      accounting.recordInvoicePayment(orgA.organizationId, orgBInvoiceId, "10.00", new Date()),
    ).rejects.toThrow(accounting.NotFoundError);
  });

  it("recordInvoicePayment rejects another organization's receiving account", async () => {
    const invoice = await accounting.createInvoice(orgA.organizationId, { customerName: "Org A Customer", lines: [{ description: "Org A test line", quantity: "1", unitPrice: "25.00" }], issueDate: new Date(), dueDate: new Date() });
    await accounting.markInvoiceSent(orgA.organizationId, invoice.id);
    await expect(accounting.recordInvoicePayment(orgA.organizationId, invoice.id, { amount: "25.00", paymentDate: new Date(), accountId: orgBAccountId, paymentMethod: "CASH", reference: "CROSS-TENANT" })).rejects.toThrow(accounting.InvalidPaymentError);
    expect(await testDb.accountingReceivablePayment.count({ where: { invoiceId: invoice.id } })).toBe(0);
  });

  it("payExpense rejects an expense id belonging to another organization", async () => {
    await expect(accounting.payExpense(orgA.organizationId, orgBExpenseId, new Date())).rejects.toThrow(
      accounting.NotFoundError,
    );
  });

  it("listAccounts never returns another organization's accounts", async () => {
    const accounts = await accounting.listAccounts(orgA.organizationId);
    expect(accounts.some((a) => a.id === orgBAccountId)).toBe(false);
    expect(accounts.some((a) => a.id === orgAAccountId)).toBe(true);
  });

  it("sanity: Org B's invoice really exists in the real database, scoped to Org B", async () => {
    const row = await testDb.accountingInvoice.findUnique({ where: { id: orgBInvoiceId } });
    expect(row?.organizationId).toBe(orgB.organizationId);
  });
});
