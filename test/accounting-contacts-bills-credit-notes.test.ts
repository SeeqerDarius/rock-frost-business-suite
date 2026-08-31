import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("@/platform/module-requests/configuration", () => ({
  getOrganizationModuleConfiguration: vi.fn().mockResolvedValue({ workflow: {}, limits: {} }),
  updateOrganizationModuleConfigurationValues: vi.fn(),
}));

const mockDb = {
  accountingContact: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  accountingAccount: { count: vi.fn(), findMany: vi.fn(), createMany: vi.fn(), findFirst: vi.fn() },
  accountingJournalEntry: { create: vi.fn(), count: vi.fn(), findFirst: vi.fn() },
  accountingTaxTransaction: { create: vi.fn() },
  accountingPeriod: { findFirst: vi.fn() },
  accountingBill: { count: vi.fn(), create: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn(), update: vi.fn(), findUniqueOrThrow: vi.fn() },
  accountingPayablePayment: { create: vi.fn() },
  accountingInvoice: { findFirst: vi.fn(), update: vi.fn() },
  accountingCreditNote: { count: vi.fn(), create: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn() },
  $transaction: vi.fn(),
  $queryRaw: vi.fn(),
  $executeRaw: vi.fn(),
};

vi.mock("@/lib/db", () => ({ db: mockDb }));

function txPassthrough() {
  mockDb.$transaction.mockImplementation(async (fn: (tx: typeof mockDb) => Promise<unknown>) => fn(mockDb));
}

const accounting = await import("@/modules/accounting/service");

const ORG = "org-1";

const DEFAULT_ACCOUNTS = [
  { id: "acct-cash", code: "1000" },
  { id: "acct-ar", code: "1100" },
  { id: "acct-inventory", code: "1200" },
  { id: "acct-vat-in", code: "1300" },
  { id: "acct-nhil-in", code: "1310" },
  { id: "acct-getfund-in", code: "1320" },
  { id: "acct-ap", code: "2000" },
  { id: "acct-vat-out", code: "2100" },
  { id: "acct-nhil-out", code: "2110" },
  { id: "acct-getfund-out", code: "2120" },
  { id: "acct-revenue", code: "4000" },
  { id: "acct-expense", code: "5000" },
];

beforeEach(() => {
  vi.clearAllMocks();
  txPassthrough();
  mockDb.accountingPeriod.findFirst.mockResolvedValue(null);
  mockDb.accountingJournalEntry.count.mockResolvedValue(0);
  mockDb.accountingJournalEntry.findFirst.mockResolvedValue(null);
  mockDb.accountingAccount.findMany.mockResolvedValue(DEFAULT_ACCOUNTS);
});

describe("computeLineItems: line-total-vs-cached-total consistency", () => {
  it("taxableAmount equals the exact sum of every line's lineTotal", () => {
    const result = accounting.computeLineItems([
      { description: "Consulting, phase 1", quantity: "10", unitPrice: "50.00" },
      { description: "Consulting, phase 2", quantity: "5", unitPrice: "80.00" },
    ]);
    expect(result.lines[0].lineTotal.toString()).toBe("500");
    expect(result.lines[1].lineTotal.toString()).toBe("400");
    expect(result.taxableAmount.toString()).toBe("900");
  });

  it("rejects a zero quantity", () => {
    expect(() => accounting.computeLineItems([{ description: "Item", quantity: "0", unitPrice: "10.00" }])).toThrow(accounting.InvalidLineItemsError);
  });

  it("rejects a negative unit price", () => {
    expect(() => accounting.computeLineItems([{ description: "Item", quantity: "1", unitPrice: "-10.00" }])).toThrow(accounting.InvalidLineItemsError);
  });

  it("rejects a blank description", () => {
    expect(() => accounting.computeLineItems([{ description: "  ", quantity: "1", unitPrice: "10.00" }])).toThrow(accounting.InvalidLineItemsError);
  });

  it("rejects an empty line list", () => {
    expect(() => accounting.computeLineItems([])).toThrow(accounting.InvalidLineItemsError);
  });
});

describe("Contact CRUD - cross-tenant isolation", () => {
  it("updateContact rejects a contact id belonging to another organization", async () => {
    mockDb.accountingContact.findFirst.mockResolvedValue(null);
    await expect(
      accounting.updateContact(ORG, "contact-foreign", { type: "CUSTOMER", name: "Renamed" }),
    ).rejects.toThrow(accounting.NotFoundError);
    expect(mockDb.accountingContact.update).not.toHaveBeenCalled();
  });

  it("updateContact succeeds for a contact owned by this organization", async () => {
    mockDb.accountingContact.findFirst.mockResolvedValue({ id: "contact-1" });
    mockDb.accountingContact.update.mockResolvedValue({ id: "contact-1", name: "Renamed" });
    await accounting.updateContact(ORG, "contact-1", { type: "CUSTOMER", name: "Renamed" });
    expect(mockDb.accountingContact.update).toHaveBeenCalledWith({ where: { id: "contact-1" }, data: { type: "CUSTOMER", name: "Renamed" } });
  });
});

describe("Bill lifecycle: create, approve, partial payment", () => {
  const BILL_LINES = [
    { description: "Office rent, August", quantity: "1", unitPrice: "1500.00" },
    { description: "Utilities, August", quantity: "1", unitPrice: "300.00" },
  ];

  it("createBill's cached taxableAmount equals the sum of its lines, with no tax code applied", async () => {
    mockDb.accountingAccount.findFirst.mockResolvedValue({ id: "acct-expense", type: "EXPENSE" });
    mockDb.accountingBill.count.mockResolvedValue(0);
    mockDb.accountingBill.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "bill-1", ...data, lines: [] }));

    const bill = await accounting.createBill(ORG, {
      supplierName: "Accra Properties Ltd",
      expenseAccountId: "acct-expense",
      lines: BILL_LINES,
      billDate: new Date("2026-08-01"),
      dueDate: new Date("2026-08-31"),
    });

    expect(bill.taxableAmount.toString()).toBe("1800");
    expect(bill.amount.toString()).toBe("1800");
  });

  it("recordBillPayment partially pays a multi-line bill, leaving it PARTIALLY_PAID with the correct remaining balance", async () => {
    let billState = {
      id: "bill-1",
      billNumber: "BILL-0001",
      supplierName: "Accra Properties Ltd",
      amount: "1800.00",
      amountPaid: "0.00",
      status: "APPROVED",
      expenseAccountId: "acct-expense",
      taxableAmount: "1800.00",
      vatAmount: "0.00",
      nhilAmount: "0.00",
      getfundAmount: "0.00",
      taxCodeId: null as string | null,
      branchId: null as string | null,
    };

    mockDb.accountingBill.findFirst.mockImplementation(async () => ({ ...billState }));
    mockDb.$queryRaw.mockImplementation(async () => [{ id: billState.id, amount: billState.amount, amountPaid: billState.amountPaid, status: billState.status }]);
    mockDb.accountingAccount.findFirst.mockResolvedValue({ id: "acct-momo", active: true, liquidityType: "MOBILE_MONEY" });
    mockDb.accountingPayablePayment.create.mockResolvedValue({ id: "payment-1" });
    mockDb.accountingAccount.count.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.length);
    mockDb.accountingBill.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      const increment = (data.amountPaid as { increment?: string } | undefined)?.increment;
      if (increment !== undefined) billState = { ...billState, amountPaid: (Number(billState.amountPaid) + Number(increment)).toFixed(2) };
      if (data.status) billState = { ...billState, status: data.status as string };
      return { ...billState };
    });

    const result = await accounting.recordBillPayment(ORG, "bill-1", {
      amount: "1000.00",
      paymentDate: new Date("2026-08-10"),
      accountId: "acct-momo",
      paymentMethod: "MOBILE_MONEY",
    });

    expect(result.bill.status).toBe("PARTIALLY_PAID");
    expect(result.bill.amountPaid).toBe("1000.00");
    expect(Number(result.bill.amount) - Number(result.bill.amountPaid)).toBeCloseTo(800, 2);
  });

  it("recordBillPayment rejects an amount exceeding the outstanding balance", async () => {
    mockDb.accountingBill.findFirst.mockResolvedValue({ id: "bill-1", amount: "1800.00", amountPaid: "1500.00", status: "PARTIALLY_PAID" });
    await expect(
      accounting.recordBillPayment(ORG, "bill-1", { amount: "500.00", paymentDate: new Date(), accountId: "acct-momo", paymentMethod: "CASH" }),
    ).rejects.toThrow(accounting.InvalidPaymentError);
  });
});

describe("Credit note applied to an invoice reduces its outstanding balance", () => {
  it("applyCreditNoteToInvoice posts a balanced entry and increments the invoice's amountCredited", async () => {
    const creditNote = {
      id: "cn-1",
      creditNoteNumber: "CN-0001",
      customerName: "Kofi Mensah",
      amount: new Prisma.Decimal("115.00"),
      taxableAmount: new Prisma.Decimal("100.00"),
      vatAmount: new Prisma.Decimal("15.00"),
      nhilAmount: new Prisma.Decimal("0.00"),
      getfundAmount: new Prisma.Decimal("0.00"),
      taxCodeId: null,
      status: "DRAFT",
    };
    const invoice = {
      id: "invoice-1",
      invoiceNumber: "INV-0001",
      status: "SENT",
      amount: "500.00",
      amountPaid: "0.00",
      amountCredited: "0.00",
      branchId: null,
    };

    mockDb.accountingCreditNote.findFirst.mockResolvedValue(creditNote);
    mockDb.accountingInvoice.findFirst.mockResolvedValue(invoice);
    mockDb.accountingCreditNote.updateMany.mockResolvedValue({ count: 1 });
    mockDb.accountingAccount.count.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.length);
    mockDb.accountingInvoice.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      const increment = (data.amountCredited as { increment?: string } | undefined)?.increment;
      const amountCredited = increment !== undefined ? (Number(invoice.amountCredited) + Number(increment)).toFixed(2) : invoice.amountCredited;
      return { ...invoice, amountCredited, ...(data.status ? { status: data.status } : {}) };
    });
    mockDb.accountingCreditNote.findUniqueOrThrow.mockResolvedValue({ ...creditNote, status: "APPLIED", invoiceId: invoice.id });

    const result = await accounting.applyCreditNoteToInvoice(ORG, "cn-1", "invoice-1", "user-1");

    expect(result.status).toBe("APPLIED");
    expect(mockDb.accountingInvoice.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "invoice-1" },
      data: { amountCredited: { increment: creditNote.amount } },
    }));
    // Debit Revenue (taxableAmount) + Debit VAT payable (vatAmount) = Credit AR (amount, gross) - must balance exactly.
    const journalCall = mockDb.accountingJournalEntry.create.mock.calls[0][0];
    const totalDebit = journalCall.data.lines.create.reduce((sum: number, line: { debit?: string }) => sum + Number(line.debit ?? 0), 0);
    const totalCredit = journalCall.data.lines.create.reduce((sum: number, line: { credit?: string }) => sum + Number(line.credit ?? 0), 0);
    expect(totalDebit).toBeCloseTo(totalCredit, 2);
    expect(totalCredit).toBeCloseTo(115, 2);
  });

  it("applyCreditNoteToInvoice rejects a credit note larger than the invoice's outstanding balance", async () => {
    mockDb.accountingCreditNote.findFirst.mockResolvedValue({ id: "cn-1", amount: "600.00", status: "DRAFT" });
    mockDb.accountingInvoice.findFirst.mockResolvedValue({ id: "invoice-1", status: "SENT", amount: "500.00", amountPaid: "0.00", amountCredited: "0.00" });
    await expect(accounting.applyCreditNoteToInvoice(ORG, "cn-1", "invoice-1", "user-1")).rejects.toThrow(accounting.CreditNoteStateError);
  });

  it("applyCreditNoteToInvoice rejects an invoice id belonging to another organization", async () => {
    mockDb.accountingCreditNote.findFirst.mockResolvedValue({ id: "cn-1", amount: "100.00", status: "DRAFT" });
    mockDb.accountingInvoice.findFirst.mockResolvedValue(null);
    await expect(accounting.applyCreditNoteToInvoice(ORG, "cn-1", "invoice-foreign", "user-1")).rejects.toThrow(accounting.NotFoundError);
  });
});
