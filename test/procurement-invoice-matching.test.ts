import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = {
  $executeRaw: vi.fn(),
  $transaction: vi.fn(),
  procurementRequest: { findFirst: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn() },
  procurementOrder: { findFirst: vi.fn() },
  procurementSupplierInvoice: { create: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn(), findFirstOrThrow: vi.fn() },
  procurementSupplierInvoiceLine: { findMany: vi.fn() },
};

vi.mock("@/lib/db", () => ({ db: mockDb }));

const procurement = await import("@/modules/procurement/service");
const ORG = "org-1";
const order = { id: "order-1", vendorId: "vendor-1", lines: [{ id: "line-1", description: "Paper", quantity: 10, receivedQuantity: 6, unitCost: "5.00" }] };

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.$transaction.mockImplementation(async (callback) => callback(mockDb));
  mockDb.$executeRaw.mockResolvedValue(0);
  mockDb.procurementOrder.findFirst.mockResolvedValue(order);
  mockDb.procurementSupplierInvoiceLine.findMany.mockResolvedValue([]);
  mockDb.procurementSupplierInvoice.create.mockImplementation(async ({ data }) => ({ id: "invoice-1", ...data }));
});

describe("procurement supplier invoice matching", () => {
  it("prevents a request creator from approving their own request", async () => {
    mockDb.procurementRequest.findFirst.mockResolvedValue({ id: "request-1", requestedById: "maker-1", status: "PENDING" });
    await expect(procurement.approveRequest(ORG, "request-1", "maker-1")).rejects.toThrow(procurement.RequestApprovalError);
    expect(mockDb.procurementRequest.updateMany).not.toHaveBeenCalled();
  });

  it("rejects invoicing more than the received quantity", async () => {
    await expect(procurement.createSupplierInvoice(ORG, { vendorId: "vendor-1", orderId: "order-1", invoiceNumber: "INV-1", invoiceDate: new Date(), lines: [{ orderLineId: "line-1", quantity: 7, unitCost: "5.00" }] })).rejects.toThrow(procurement.InvoiceMatchError);
    expect(mockDb.procurementSupplierInvoice.create).not.toHaveBeenCalled();
  });

  it("includes prior non-rejected invoices when enforcing the remaining received quantity", async () => {
    mockDb.procurementSupplierInvoiceLine.findMany.mockResolvedValue([{ orderLineId: "line-1", quantity: 4 }]);
    await expect(procurement.createSupplierInvoice(ORG, { vendorId: "vendor-1", orderId: "order-1", invoiceNumber: "INV-2", invoiceDate: new Date(), lines: [{ orderLineId: "line-1", quantity: 3, unitCost: "5.00" }] })).rejects.toThrow(procurement.InvoiceMatchError);
  });

  it("marks a unit-cost mismatch as an exception rather than silently approving it", async () => {
    const result = await procurement.createSupplierInvoice(ORG, { vendorId: "vendor-1", orderId: "order-1", invoiceNumber: "INV-3", invoiceDate: new Date(), createdById: "maker-1", lines: [{ orderLineId: "line-1", quantity: 6, unitCost: "5.50" }] });
    expect(result.status).toBe("EXCEPTION");
    expect(result.exceptionNote).toContain("unit cost");
  });

  it("enforces maker-checker and blocks approval of an unresolved exception", async () => {
    mockDb.procurementSupplierInvoice.findFirst.mockResolvedValue({ id: "invoice-1", organizationId: ORG, createdById: "maker-1", status: "MATCHED" });
    await expect(procurement.reviewSupplierInvoice(ORG, "invoice-1", "maker-1", "APPROVE")).rejects.toThrow(procurement.InvoiceApprovalError);
    mockDb.procurementSupplierInvoice.findFirst.mockResolvedValue({ id: "invoice-1", organizationId: ORG, createdById: "maker-1", status: "EXCEPTION" });
    await expect(procurement.reviewSupplierInvoice(ORG, "invoice-1", "reviewer-1", "APPROVE")).rejects.toThrow(procurement.InvoiceApprovalError);
    expect(mockDb.procurementSupplierInvoice.updateMany).not.toHaveBeenCalled();
  });
});
