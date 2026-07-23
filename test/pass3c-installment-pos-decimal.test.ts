import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Regression tests for docs/HARDENING_PLAN.md Pass 3c: the remaining
 * Installment IDOR/validation gaps, POS register warehouse validation, and
 * the Decimal-precision hygiene fixes (Prisma.Decimal replacing JS Number
 * arithmetic on values that get written straight to the database).
 */

const mockDb = {
  hirePurchaseStaff: { findFirst: vi.fn() },
  hirePurchaseProduct: { findFirst: vi.fn() },
  hirePurchaseStaffSalaryPayment: { create: vi.fn() },
  hirePurchaseStaffInventory: { upsert: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  hirePurchaseSettings: { findUnique: vi.fn(), update: vi.fn() },
  hirePurchaseAccount: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  hirePurchaseCustomer: { findFirst: vi.fn() },
  hirePurchasePayment: { create: vi.fn(), findMany: vi.fn() },
  hirePurchaseCredit: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },

  posRegister: { create: vi.fn(), update: vi.fn() },
  inventoryWarehouse: { findFirst: vi.fn() },

  accountingAccount: { count: vi.fn(), findMany: vi.fn() },
  accountingJournalEntry: { create: vi.fn() },
  accountingInvoice: { findFirst: vi.fn(), update: vi.fn() },

  payrollCompensation: { findMany: vi.fn() },
  payrollRun: { findFirst: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn() },
  payrollSettings: { findUnique: vi.fn() },
  payrollPayslip: { create: vi.fn() },

  $transaction: vi.fn(),
  $queryRaw: vi.fn(),
};

vi.mock("@/lib/db", () => ({ db: mockDb }));

function txPassthrough() {
  mockDb.$transaction.mockImplementation(async (fn: (tx: typeof mockDb) => Promise<unknown>) => fn(mockDb));
}

const installment = await import("@/modules/installment/service");
const pos = await import("@/modules/pos/service");
const accounting = await import("@/modules/accounting/service");
const payroll = await import("@/modules/payroll/service");

const ORG = "org-1";
const ORGANIZATION_SCOPE = { kind: "organization" } as const;

beforeEach(() => {
  vi.clearAllMocks();
  txPassthrough();
});

describe("Installment — recordStaffSalaryPayment / adjustStaffInventory / updateInstallmentSettings validation", () => {
  it("recordStaffSalaryPayment rejects a non-positive amount before touching the database", async () => {
    await expect(
      installment.recordStaffSalaryPayment(ORG, {
        staffId: "staff-1",
        amount: "0",
        paymentDate: new Date(),
        salaryMonth: new Date(),
      }),
    ).rejects.toThrow(installment.InvalidPaymentAmountError);
    expect(mockDb.hirePurchaseStaff.findFirst).not.toHaveBeenCalled();
  });

  it("recordStaffSalaryPayment rejects a staff id from another organization", async () => {
    mockDb.hirePurchaseStaff.findFirst.mockResolvedValue(null);
    await expect(
      installment.recordStaffSalaryPayment(ORG, {
        staffId: "staff-foreign",
        amount: "100.00",
        paymentDate: new Date(),
        salaryMonth: new Date(),
      }),
    ).rejects.toThrow(installment.NotFoundError);
  });

  it("adjustStaffInventory rejects a staff id from another organization", async () => {
    mockDb.hirePurchaseStaff.findFirst.mockResolvedValue(null);
    await expect(installment.adjustStaffInventory(ORG, "staff-foreign", "prod-1", 5)).rejects.toThrow(
      installment.NotFoundError,
    );
    expect(mockDb.hirePurchaseProduct.findFirst).not.toHaveBeenCalled();
  });

  it("adjustStaffInventory rejects a product id from another organization", async () => {
    mockDb.hirePurchaseStaff.findFirst.mockResolvedValue({ id: "staff-1", organizationId: ORG });
    mockDb.hirePurchaseProduct.findFirst.mockResolvedValue(null);
    await expect(installment.adjustStaffInventory(ORG, "staff-1", "prod-foreign", 5)).rejects.toThrow(
      installment.NotFoundError,
    );
  });

  it("updateInstallmentSettings rejects a percent field outside 0-100", async () => {
    await expect(
      installment.updateInstallmentSettings(ORG, { administrationFeePercent: "150" }),
    ).rejects.toThrow(installment.InvalidSettingsError);
  });

  it("updateInstallmentSettings rejects a negative money field", async () => {
    await expect(
      installment.updateInstallmentSettings(ORG, { minimumDeposit: "-5" }),
    ).rejects.toThrow(installment.InvalidSettingsError);
  });
});

describe("POS — register warehouse IDOR", () => {
  it("createRegister rejects a warehouse id from another organization", async () => {
    mockDb.inventoryWarehouse.findFirst.mockResolvedValue(null);
    await expect(
      pos.createRegister(ORG, { name: "Front desk", warehouseId: "wh-foreign" }),
    ).rejects.toThrow(pos.NotFoundError);
    expect(mockDb.posRegister.create).not.toHaveBeenCalled();
  });

  it("updateRegister rejects a warehouse id from another organization", async () => {
    mockDb.inventoryWarehouse.findFirst.mockResolvedValue(null);
    await expect(
      pos.updateRegister(ORG, "reg-1", { name: "Front desk", warehouseId: "wh-foreign" }),
    ).rejects.toThrow(pos.NotFoundError);
    expect(mockDb.posRegister.update).not.toHaveBeenCalled();
  });

  it("createRegister allows a null warehouseId (register not tied to a warehouse)", async () => {
    mockDb.posRegister.create.mockResolvedValue({ id: "reg-1" });
    await expect(pos.createRegister(ORG, { name: "Front desk", warehouseId: null })).resolves.toBeDefined();
    expect(mockDb.inventoryWarehouse.findFirst).not.toHaveBeenCalled();
  });
});

describe("Decimal-precision hygiene — exact arithmetic replacing JS Number/epsilon workarounds", () => {
  it("accounting: a journal entry balanced to the cent by repeated 0.1 additions is accepted (float summation would drift)", async () => {
    mockDb.accountingAccount.count.mockResolvedValue(2);
    mockDb.accountingJournalEntry.create.mockResolvedValue({ id: "je-1" });

    // 0.1 + 0.1 + 0.1 !== 0.3 in JS float arithmetic — Decimal must get this exactly right.
    await expect(
      accounting.createManualJournalEntry(ORG, {
        entryDate: new Date(),
        description: "Rounding check",
        lines: [
          { accountId: "acct-a", debit: "0.10" },
          { accountId: "acct-a", debit: "0.10" },
          { accountId: "acct-a", debit: "0.10" },
          { accountId: "acct-b", credit: "0.30" },
        ],
      }),
    ).resolves.toBeDefined();
  });

  it("accounting: a genuinely unbalanced journal entry is still rejected", async () => {
    mockDb.accountingAccount.count.mockResolvedValue(2);
    await expect(
      accounting.createManualJournalEntry(ORG, {
        entryDate: new Date(),
        description: "Unbalanced",
        lines: [
          { accountId: "acct-a", debit: "100.00" },
          { accountId: "acct-b", credit: "99.99" },
        ],
      }),
    ).rejects.toThrow(accounting.JournalNotBalancedError);
  });

  it("accounting: recordInvoicePayment accepts a payment that exactly matches the remaining balance (no float epsilon needed)", async () => {
    mockDb.accountingInvoice.findFirst.mockResolvedValue({
      id: "inv-1",
      status: "SENT",
      amount: "100.10",
      amountPaid: "0.00",
      invoiceNumber: "INV-0001",
    });
    mockDb.accountingAccount.findMany.mockResolvedValue([
      { id: "acct-cash", code: "1000" },
      { id: "acct-ar", code: "1100" },
      { id: "acct-ap", code: "2000" },
      { id: "acct-rev", code: "4000" },
      { id: "acct-exp", code: "5000" },
    ]);
    mockDb.accountingAccount.count.mockResolvedValue(2);
    mockDb.accountingInvoice.update.mockResolvedValue({ id: "inv-1", amountPaid: "100.10", amount: "100.10" });
    // The remaining-balance guard now runs against a row locked with
    // SELECT ... FOR UPDATE inside the transaction (see
    // docs/HARDENING_PLAN.md's Pass 4 section) rather than the
    // pre-transaction findFirst read above.
    mockDb.$queryRaw.mockResolvedValue([{ id: "inv-1", status: "SENT", amount: "100.10", amountPaid: "0.00" }]);

    await expect(accounting.recordInvoicePayment(ORG, "inv-1", "100.10", new Date())).resolves.toBeDefined();
  });

  it("installment: createAccount computes targetAmount/balance exactly for a repeating-decimal admin fee rate", async () => {
    mockDb.hirePurchaseProduct.findFirst.mockResolvedValue({
      id: "prod-1",
      organizationId: ORG,
      price: "300.00",
      dailyAmount: "5.00",
      duration: 60,
    });
    mockDb.hirePurchaseCustomer.findFirst.mockResolvedValue({ id: "cust-1", organizationId: ORG });
    mockDb.hirePurchaseStaff.findFirst.mockResolvedValue({ id: "staff-1", organizationId: ORG });
    mockDb.hirePurchaseSettings.findUnique.mockResolvedValue({
      organizationId: ORG,
      minimumDeposit: "0",
      administrationFeePercent: "3.33", // deliberately not a clean binary fraction
      receiptPrefix: "RCPT",
    });
    mockDb.hirePurchaseStaffInventory.findUnique.mockResolvedValue({ id: "inv-row-1", quantity: 5 });
    mockDb.hirePurchaseStaffInventory.update.mockResolvedValue({});
    let createdAccount: { targetAmount?: string; balance?: string } = {};
    mockDb.hirePurchaseAccount.create.mockImplementation(async ({ data }: { data: typeof createdAccount }) => {
      createdAccount = data;
      return { id: "acct-1", ...data };
    });

    await installment.createAccount(ORG, ORGANIZATION_SCOPE, {
      customerId: "cust-1",
      productId: "prod-1",
      inventoryStaffId: "staff-1",
      startDate: new Date("2026-01-01"),
    });

    // 300.00 * 1.0333 = 309.99 exactly — a float computation of 300 * (3.33/100) can
    // drift by a sub-cent amount that .toFixed(2) may round the wrong way.
    expect(createdAccount.targetAmount).toBe("309.99");
    expect(createdAccount.balance).toBe("309.99");
  });

  it("installment: applyCreditToAccount partially applies a credit larger than the account balance, leaving the remainder OPEN", async () => {
    mockDb.hirePurchaseCredit.findFirst.mockResolvedValue({ id: "credit-1" });
    mockDb.hirePurchaseAccount.findFirst.mockResolvedValue({ id: "acct-1" });
    // Both the credit and the target account are now read via
    // SELECT ... FOR UPDATE inside the transaction (see
    // docs/HARDENING_PLAN.md's Pass 4 section), not findFirst — mocked
    // here as two sequential $queryRaw calls in that same order.
    mockDb.$queryRaw
      .mockResolvedValueOnce([
        { id: "credit-1", customerId: "cust-1", status: "OPEN", remainingAmount: "50.00", source: "PAYMENT_OVERPAYMENT" },
      ])
      .mockResolvedValueOnce([
        { id: "acct-1", customerId: "cust-1", balance: "30.00", totalPaid: "270.00", status: "ACTIVE" },
      ]);
    mockDb.hirePurchaseSettings.findUnique.mockResolvedValue({ organizationId: ORG, receiptPrefix: "RCPT" });
    mockDb.hirePurchasePayment.findMany.mockResolvedValue([]);
    mockDb.hirePurchaseAccount.updateMany.mockResolvedValue({ count: 1 });
    mockDb.hirePurchaseCredit.updateMany.mockResolvedValue({ count: 1 });

    await installment.applyCreditToAccount(ORG, ORGANIZATION_SCOPE, "credit-1", "acct-1");

    expect(mockDb.hirePurchaseAccount.updateMany).toHaveBeenCalledWith({
      where: { id: "acct-1", organizationId: ORG, AND: {} },
      data: { totalPaid: "300.00", balance: "0.00", status: "COMPLETED" },
    });
    expect(mockDb.hirePurchaseCredit.updateMany).toHaveBeenCalledWith({
      where: { id: "credit-1", organizationId: ORG, AND: {} },
      data: { remainingAmount: "20.00", status: "OPEN" },
    });
  });

  it("payroll: processRun computes netPay exactly for a tax rate that isn't a clean binary fraction", async () => {
    mockDb.payrollRun.findFirst.mockResolvedValue({ id: "run-1", organizationId: ORG, status: "DRAFT" });
    mockDb.payrollSettings.findUnique.mockResolvedValue({ defaultTaxRate: "0.15" });
    mockDb.payrollCompensation.findMany.mockResolvedValue([{ employeeId: "emp-1", baseSalary: "1000.10" }]);
    mockDb.payrollRun.updateMany.mockResolvedValue({ count: 1 });
    mockDb.payrollRun.findUniqueOrThrow.mockResolvedValue({ id: "run-1", status: "COMPLETED" });

    let createdPayslip: { grossPay?: string; taxDeduction?: string; netPay?: string } = {};
    mockDb.payrollPayslip.create.mockImplementation(async ({ data }: { data: typeof createdPayslip }) => {
      createdPayslip = data;
      return { id: "payslip-1", ...data };
    });

    await payroll.processRun(ORG, "run-1");

    expect(createdPayslip.grossPay).toBe("1000.10");
    // 1000.10 * 0.15 = 150.015 exactly; taxDeduction rounds that to 150.02 for
    // display, but netPay is computed from the unrounded 150.015, giving
    // 850.085 -> 850.09 (not 1000.10 - 150.02 = 850.08).
    expect(createdPayslip.taxDeduction).toBe("150.02");
    expect(createdPayslip.netPay).toBe("850.09");
  });
});
