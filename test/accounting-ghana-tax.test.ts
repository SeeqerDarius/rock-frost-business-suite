import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/platform/module-requests/configuration", () => ({
  getOrganizationModuleConfiguration: vi.fn().mockResolvedValue({ workflow: {}, limits: {} }),
  updateOrganizationModuleConfigurationValues: vi.fn(),
}));

const mockDb = {
  accountingAccount: { count: vi.fn(), findMany: vi.fn(), createMany: vi.fn(), findFirst: vi.fn() },
  accountingBill: { findFirst: vi.fn(), update: vi.fn() },
  accountingPayablePayment: { create: vi.fn() },
  accountingJournalEntry: { create: vi.fn(), count: vi.fn(), findFirst: vi.fn() },
  accountingPeriod: { findFirst: vi.fn() },
  accountingTaxCode: { findFirst: vi.fn() },
  $transaction: vi.fn(),
  $queryRaw: vi.fn(),
  $executeRaw: vi.fn(),
};

vi.mock("@/lib/db", () => ({ db: mockDb }));

function txPassthrough() {
  mockDb.$transaction.mockImplementation(async (fn: (tx: typeof mockDb) => Promise<unknown>) => fn(mockDb));
}

const accounting = await import("@/modules/accounting/service");
const taxService = await import("@/modules/accounting/tax-service");

const ORG = "org-1";

// Includes the new Withholding Tax Payable (2130) default account alongside
// the 12 pre-existing system accounts.
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
  { id: "acct-wht-payable", code: "2130" },
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
  mockDb.accountingAccount.count.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.length);
  mockDb.accountingAccount.findFirst.mockResolvedValue({ id: "acct-momo", active: true, liquidityType: "MOBILE_MONEY" });
  mockDb.accountingPayablePayment.create.mockResolvedValue({ id: "payment-1" });
});

const APPROVED_BILL = { id: "bill-1", organizationId: ORG, branchId: null, billNumber: "BILL-0001", amount: "1000.00", amountPaid: "0.00", status: "APPROVED" };

describe("recordBillPayment: no withholding configured (regression guard)", () => {
  it("posts the same two-line entry as always when the bill has no tax code", async () => {
    mockDb.accountingBill.findFirst.mockResolvedValue({ ...APPROVED_BILL, taxCode: null });
    mockDb.$queryRaw.mockResolvedValue([{ id: APPROVED_BILL.id, amount: APPROVED_BILL.amount, amountPaid: APPROVED_BILL.amountPaid, status: APPROVED_BILL.status }]);
    mockDb.accountingBill.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...APPROVED_BILL, ...data, amountPaid: "1000.00" }));

    await accounting.recordBillPayment(ORG, "bill-1", { amount: "1000.00", paymentDate: new Date(), accountId: "acct-momo", paymentMethod: "MOBILE_MONEY" });

    const paymentCallData = mockDb.accountingPayablePayment.create.mock.calls[0][0].data;
    expect(paymentCallData.withholdingTaxAmount.isZero()).toBe(true);
    const journalCall = mockDb.accountingJournalEntry.create.mock.calls[0][0];
    expect(journalCall.data.lines.create).toHaveLength(2);
    expect(journalCall.data.lines.create).toEqual([
      { accountId: "acct-ap", debit: "1000.00", credit: 0 },
      { accountId: "acct-momo", debit: 0, credit: "1000.00" },
    ]);
  });

  it("posts the same two-line entry when the bill's tax code has a zero withholding rate", async () => {
    mockDb.accountingBill.findFirst.mockResolvedValue({ ...APPROVED_BILL, taxCode: { withholdingRate: "0" } });
    mockDb.$queryRaw.mockResolvedValue([{ id: APPROVED_BILL.id, amount: APPROVED_BILL.amount, amountPaid: APPROVED_BILL.amountPaid, status: APPROVED_BILL.status }]);
    mockDb.accountingBill.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...APPROVED_BILL, ...data, amountPaid: "1000.00" }));

    await accounting.recordBillPayment(ORG, "bill-1", { amount: "1000.00", paymentDate: new Date(), accountId: "acct-momo", paymentMethod: "MOBILE_MONEY" });

    const journalCall = mockDb.accountingJournalEntry.create.mock.calls[0][0];
    expect(journalCall.data.lines.create).toHaveLength(2);
  });
});

describe("recordBillPayment: withholding tax configured on the bill's tax code", () => {
  it("splits the payment into cash (net of withholding) and a credit to Withholding Tax Payable, while clearing the full amount from the bill", async () => {
    mockDb.accountingBill.findFirst.mockResolvedValue({ ...APPROVED_BILL, taxCode: { withholdingRate: "10" } });
    mockDb.$queryRaw.mockResolvedValue([{ id: APPROVED_BILL.id, amount: APPROVED_BILL.amount, amountPaid: APPROVED_BILL.amountPaid, status: APPROVED_BILL.status }]);
    mockDb.accountingBill.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...APPROVED_BILL, ...data, amountPaid: "1000.00" }));

    const { bill } = await accounting.recordBillPayment(ORG, "bill-1", { amount: "1000.00", paymentDate: new Date(), accountId: "acct-momo", paymentMethod: "MOBILE_MONEY" });

    expect(mockDb.accountingPayablePayment.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ withholdingTaxAmount: expect.anything() }) }));
    const withheldArg = mockDb.accountingPayablePayment.create.mock.calls[0][0].data.withholdingTaxAmount;
    expect(withheldArg.toString()).toBe("100");

    const journalCall = mockDb.accountingJournalEntry.create.mock.calls[0][0];
    expect(journalCall.data.lines.create).toEqual([
      { accountId: "acct-ap", debit: "1000.00", credit: 0 },
      { accountId: "acct-momo", debit: 0, credit: "900.00" },
      { accountId: "acct-wht-payable", debit: 0, credit: "100.00" },
    ]);
    // The full 1000 clears the payable, even though only 900 left as cash - the
    // other 100 was withheld and is now owed to GRA instead of the supplier.
    expect(mockDb.accountingBill.update).toHaveBeenCalledWith(expect.objectContaining({ data: { amountPaid: { increment: expect.anything() } } }));
    expect(bill.amountPaid).toBe("1000.00");
  });
});

describe("calculateWithholdingTax", () => {
  it("computes the withheld amount and the net payable to the supplier", () => {
    const { withheld, netPayable } = taxService.calculateWithholdingTax("500.00", "7.5");
    expect(withheld.toString()).toBe("37.5");
    expect(netPayable.toString()).toBe("462.5");
  });

  it("withholds nothing at a zero rate", () => {
    const { withheld, netPayable } = taxService.calculateWithholdingTax("500.00", "0");
    expect(withheld.isZero()).toBe(true);
    expect(netPayable.toString()).toBe("500");
  });
});

describe("calculateTaxInclusive: round-trips exactly against calculateTax's forward calculation", () => {
  const STANDARD_CODE = { id: "tax-1", vatRate: "15", nhilRate: "2.5", getfundRate: "2.5" };

  it("back-calculates the same taxable amount that calculateTax would have grossed up from", async () => {
    mockDb.accountingTaxCode.findFirst.mockResolvedValue(STANDARD_CODE);

    const forward = await taxService.calculateTax(ORG, "100.00", "tax-1");
    expect(forward.grossAmount.toString()).toBe("120");

    const inclusive = await taxService.calculateTaxInclusive(ORG, forward.grossAmount, "tax-1");

    expect(inclusive.taxableAmount.toString()).toBe("100");
    expect(inclusive.vatAmount.toString()).toBe("15");
    expect(inclusive.nhilAmount.toString()).toBe("2.5");
    expect(inclusive.getfundAmount.toString()).toBe("2.5");
  });

  it("always reconciles exactly to the gross amount, absorbing any rounding remainder in getfundAmount", async () => {
    mockDb.accountingTaxCode.findFirst.mockResolvedValue(STANDARD_CODE);

    const inclusive = await taxService.calculateTaxInclusive(ORG, "119.99", "tax-1");

    const reconciled = inclusive.taxableAmount.plus(inclusive.vatAmount).plus(inclusive.nhilAmount).plus(inclusive.getfundAmount);
    expect(reconciled.toString()).toBe("119.99");
  });

  it("passes the gross amount straight through untaxed when no tax code is given", async () => {
    const inclusive = await taxService.calculateTaxInclusive(ORG, "250.00", null);
    expect(inclusive.taxableAmount.toString()).toBe("250");
    expect(inclusive.totalTax.isZero()).toBe(true);
  });
});
