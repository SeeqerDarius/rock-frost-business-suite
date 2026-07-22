import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Regression tests for docs/HARDENING_PLAN.md Pass 2 (financial/inventory
 * transaction integrity + the IDOR paths that overlap with it). One shared
 * mock of @/lib/db covers every module under test here — each module's
 * Prisma namespace (inventoryStock, posSale, procurementOrder, ...) is
 * independent, so sharing the mock object across describe blocks is safe.
 */

const mockDb = {
  inventoryItem: { findFirst: vi.fn() },
  inventoryWarehouse: { findFirst: vi.fn() },
  inventoryStock: { upsert: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  inventoryMovement: { create: vi.fn() },

  posRegister: { findFirst: vi.fn() },
  posSession: { findFirst: vi.fn() },
  posSale: { create: vi.fn(), updateMany: vi.fn(), findFirst: vi.fn() },

  procurementVendor: { findFirst: vi.fn() },
  procurementRequest: { findFirst: vi.fn(), updateMany: vi.fn() },
  procurementOrder: { create: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
  procurementOrderLine: { findFirst: vi.fn(), updateMany: vi.fn() },

  accountingAccount: { count: vi.fn(), findMany: vi.fn(), createMany: vi.fn() },
  accountingJournalEntry: { create: vi.fn() },
  accountingInvoice: { findFirst: vi.fn(), updateMany: vi.fn(), update: vi.fn(), findUniqueOrThrow: vi.fn() },

  payrollRun: { findFirst: vi.fn(), updateMany: vi.fn() },
  payrollCompensation: { findMany: vi.fn() },
  payrollSettings: { findUnique: vi.fn() },

  hrEmployee: { findFirst: vi.fn() },
  hirePurchaseAccount: { findFirst: vi.fn() },
  hirePurchaseCustomer: { findFirst: vi.fn() },
  hirePurchaseStaff: { findFirst: vi.fn() },
  hirePurchaseProduct: { findFirst: vi.fn() },
  hirePurchaseSettings: { findUnique: vi.fn() },

  $transaction: vi.fn(),
  $queryRaw: vi.fn(),
};

vi.mock("@/lib/db", () => ({ db: mockDb }));

function txPassthrough() {
  mockDb.$transaction.mockImplementation(async (fn: (tx: typeof mockDb) => Promise<unknown>) => fn(mockDb));
}

const inventory = await import("@/modules/inventory/service");
const pos = await import("@/modules/pos/service");
const procurement = await import("@/modules/procurement/service");
const accounting = await import("@/modules/accounting/service");
const payroll = await import("@/modules/payroll/service");
const installment = await import("@/modules/installment/service");

const ORG = "org-1";

beforeEach(() => {
  vi.clearAllMocks();
  txPassthrough();
});

describe("Inventory — quantity validation, warehouse IDOR, atomic guard", () => {
  it("rejects a zero quantity", async () => {
    await expect(
      inventory.recordMovement(ORG, { itemId: "item-1", warehouseId: "wh-1", type: "RECEIPT", quantity: 0 }),
    ).rejects.toThrow();
  });

  it("rejects a negative quantity for a RECEIPT (only ADJUSTMENT may be signed)", async () => {
    await expect(
      inventory.recordMovement(ORG, { itemId: "item-1", warehouseId: "wh-1", type: "RECEIPT", quantity: -5 }),
    ).rejects.toThrow();
  });

  it("rejects a warehouse id from another organization", async () => {
    mockDb.inventoryItem.findFirst.mockResolvedValue({ id: "item-1", organizationId: ORG });
    mockDb.inventoryWarehouse.findFirst.mockResolvedValue(null);

    await expect(
      inventory.recordMovement(ORG, { itemId: "item-1", warehouseId: "wh-foreign", type: "RECEIPT", quantity: 5 }),
    ).rejects.toThrow(inventory.NotFoundError);
  });

  it("ISSUE throws InsufficientStockError when the guarded decrement's updateMany matches zero rows (oversell attempt)", async () => {
    mockDb.inventoryItem.findFirst.mockResolvedValue({ id: "item-1", organizationId: ORG });
    mockDb.inventoryWarehouse.findFirst.mockResolvedValue({ id: "wh-1", organizationId: ORG });
    mockDb.inventoryStock.upsert.mockResolvedValue({ id: "stock-1", quantity: 3 });
    mockDb.inventoryStock.updateMany.mockResolvedValue({ count: 0 }); // guard failed: not enough stock

    await expect(
      inventory.recordMovement(ORG, { itemId: "item-1", warehouseId: "wh-1", type: "ISSUE", quantity: 10 }),
    ).rejects.toThrow(inventory.InsufficientStockError);

    // Confirms the guard is expressed in the WHERE clause, not a JS read-then-write.
    expect(mockDb.inventoryStock.updateMany).toHaveBeenCalledWith({
      where: { id: "stock-1", quantity: { gte: 10 } },
      data: { quantity: { decrement: 10 } },
    });
  });
});

describe("POS — register IDOR, sale input validation, atomic refund claim", () => {
  it("openSession rejects a register id from another organization", async () => {
    mockDb.posRegister.findFirst.mockResolvedValue(null);
    await expect(pos.openSession(ORG, { registerId: "reg-foreign", openingFloat: "0" })).rejects.toThrow(
      pos.NotFoundError,
    );
  });

  it("createSale rejects a non-positive line quantity before touching the database", async () => {
    await expect(
      pos.createSale(ORG, {
        sessionId: "sess-1",
        paymentMethod: "CASH",
        lines: [{ description: "Widget", quantity: 0, unitPrice: "10.00" }],
      }),
    ).rejects.toThrow(pos.InvalidSaleInputError);
    expect(mockDb.posSession.findFirst).not.toHaveBeenCalled();
  });

  it("refundSale throws SaleStateError when the atomic claim (COMPLETED->REFUNDED) matches zero rows — the second of two concurrent refunds", async () => {
    mockDb.posSale.findFirst.mockResolvedValue({
      id: "sale-1",
      status: "COMPLETED",
      lines: [],
      register: { warehouseId: null },
      saleNumber: "SALE-00001",
    });
    mockDb.posSale.updateMany.mockResolvedValue({ count: 0 }); // another refund already claimed it

    await expect(pos.refundSale(ORG, "sale-1")).rejects.toThrow(pos.SaleStateError);
  });
});

describe("Procurement — vendor/item IDOR, atomic receiving guard", () => {
  it("createOrder rejects a vendor id from another organization", async () => {
    mockDb.procurementVendor.findFirst.mockResolvedValue(null);
    await expect(
      procurement.createOrder(ORG, {
        vendorId: "vendor-foreign",
        orderDate: new Date(),
        lines: [{ description: "Widget", quantity: 5, unitCost: "1.00" }],
      }),
    ).rejects.toThrow(procurement.NotFoundError);
  });

  it("receiveOrderLine throws ReceiveQuantityError when the atomic receivedQuantity guard matches zero rows", async () => {
    mockDb.procurementOrder.findFirst.mockResolvedValue({ id: "order-1", organizationId: ORG, status: "SENT", orderNumber: "PO-0001" });
    mockDb.procurementOrderLine.findFirst.mockResolvedValue({ id: "line-1", orderId: "order-1", quantity: 10, receivedQuantity: 0, itemId: null });
    mockDb.procurementOrderLine.updateMany.mockResolvedValue({ count: 0 }); // a concurrent receive already claimed it

    await expect(
      procurement.receiveOrderLine(ORG, { orderId: "order-1", lineId: "line-1", quantity: 5 }),
    ).rejects.toThrow(procurement.ReceiveQuantityError);
  });
});

describe("Accounting — journal account IDOR, invoice payment validation, double-post guard", () => {
  it("createManualJournalEntry rejects a line referencing an account from another organization", async () => {
    mockDb.accountingAccount.count.mockResolvedValue(1); // only 1 of 2 accountIds actually belongs to ORG

    await expect(
      accounting.createManualJournalEntry(ORG, {
        entryDate: new Date(),
        description: "Test",
        lines: [
          { accountId: "acct-own", debit: "100.00" },
          { accountId: "acct-foreign", credit: "100.00" },
        ],
      }),
    ).rejects.toThrow(accounting.NotFoundError);
  });

  it("recordInvoicePayment rejects a non-positive payment amount", async () => {
    await expect(accounting.recordInvoicePayment(ORG, "inv-1", "-50.00", new Date())).rejects.toThrow(
      accounting.InvalidPaymentError,
    );
    expect(mockDb.accountingInvoice.findFirst).not.toHaveBeenCalled();
  });

  it("recordInvoicePayment rejects an amount exceeding the remaining balance", async () => {
    mockDb.accountingInvoice.findFirst.mockResolvedValue({
      id: "inv-1",
      status: "SENT",
      amount: "100.00",
      amountPaid: "80.00",
    });
    // The remaining-balance guard now runs against a row locked with
    // SELECT ... FOR UPDATE inside the transaction, not the pre-transaction
    // findFirst read above (see docs/HARDENING_PLAN.md's Pass 4 section) —
    // the mocked $queryRaw call stands in for that locked read.
    mockDb.$queryRaw.mockResolvedValue([{ id: "inv-1", status: "SENT", amount: "100.00", amountPaid: "80.00" }]);

    await expect(accounting.recordInvoicePayment(ORG, "inv-1", "50.00", new Date())).rejects.toThrow(
      accounting.InvalidPaymentError,
    );
  });

  it("markInvoiceSent throws InvoiceStateError when the atomic DRAFT->SENT claim matches zero rows (already sent)", async () => {
    mockDb.accountingInvoice.findFirst.mockResolvedValue({
      id: "inv-1",
      status: "DRAFT",
      invoiceNumber: "INV-0001",
      customerName: "Acme",
      issueDate: new Date(),
      amount: "100.00",
    });
    mockDb.accountingAccount.findMany.mockResolvedValue([{ id: "acct-ar", code: "1100" }, { id: "acct-rev", code: "4000" }]);
    mockDb.accountingInvoice.updateMany.mockResolvedValue({ count: 0 });

    await expect(accounting.markInvoiceSent(ORG, "inv-1")).rejects.toThrow(accounting.InvoiceStateError);
  });
});

describe("Payroll — duplicate run processing guard, compensation/tax validation", () => {
  it("processRun throws RunStateError when the atomic DRAFT->COMPLETED claim matches zero rows (already processed)", async () => {
    mockDb.payrollRun.findFirst.mockResolvedValue({ id: "run-1", organizationId: ORG, status: "DRAFT" });
    mockDb.payrollSettings.findUnique.mockResolvedValue({ defaultTaxRate: "0.10" });
    mockDb.payrollCompensation.findMany.mockResolvedValue([{ employeeId: "emp-1", baseSalary: "1000.00" }]);
    mockDb.payrollRun.updateMany.mockResolvedValue({ count: 0 });

    await expect(payroll.processRun(ORG, "run-1")).rejects.toThrow(payroll.RunStateError);
  });

  it("setCompensation rejects a non-positive base salary", async () => {
    await expect(
      payroll.setCompensation(ORG, { employeeId: "emp-1", baseSalary: "0", effectiveDate: new Date() }),
    ).rejects.toThrow(payroll.InvalidCompensationError);
    expect(mockDb.hrEmployee.findFirst).not.toHaveBeenCalled();
  });

  it("updateSettings rejects a tax rate outside 0-1", async () => {
    expect(() => payroll.updateSettings(ORG, "1.5")).toThrow(payroll.InvalidCompensationError);
  });
});

describe("Installment — payment amount validation, createAccount IDOR", () => {
  it("recordPayment rejects a non-positive payment amount before touching the database", async () => {
    await expect(
      installment.recordPayment(ORG, { accountId: "acct-1", amount: "-10.00", paymentDate: new Date(), method: "Cash" }),
    ).rejects.toThrow(installment.InvalidPaymentAmountError);
    expect(mockDb.hirePurchaseAccount.findFirst).not.toHaveBeenCalled();
  });

  it("createAccount rejects a customer id from another organization", async () => {
    mockDb.hirePurchaseProduct.findFirst.mockResolvedValue({ id: "prod-1", organizationId: ORG, price: "100.00", dailyAmount: "5.00", duration: 20 });
    mockDb.hirePurchaseSettings.findUnique.mockResolvedValue({
      organizationId: ORG,
      minimumDeposit: "0",
      administrationFeePercent: "0",
      receiptPrefix: "RCPT",
    });
    mockDb.hirePurchaseCustomer.findFirst.mockResolvedValue(null);

    await expect(
      installment.createAccount(ORG, {
        customerId: "cust-foreign",
        productId: "prod-1",
        inventoryStaffId: "staff-1",
        startDate: new Date(),
      }),
    ).rejects.toThrow(installment.NotFoundError);
  });
});
