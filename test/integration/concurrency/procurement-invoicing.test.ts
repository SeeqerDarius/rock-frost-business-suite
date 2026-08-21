import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as procurement from "@/modules/procurement/service";
import { testDb } from "../setup/db";
import { cleanupTestOrg, createTestOrg, type TestOrg } from "../setup/fixtures";

let duplicateOrg: TestOrg;
let invoiceRaceOrg: TestOrg;

beforeAll(async () => {
  duplicateOrg = await createTestOrg("procurement-duplicate-invoice-lines");
  invoiceRaceOrg = await createTestOrg("procurement-invoice-race");
});

afterAll(async () => {
  await cleanupTestOrg(duplicateOrg);
  await cleanupTestOrg(invoiceRaceOrg);
});

async function createReceivedOrder(organizationId: string, suffix: string) {
  const vendor = await procurement.createVendor(organizationId, { name: `Invoice Vendor ${suffix}` });
  const order = await procurement.createOrder(organizationId, {
    vendorId: vendor.id,
    orderDate: new Date("2026-04-01T00:00:00.000Z"),
    lines: [{ description: `Received item ${suffix}`, quantity: 10, unitCost: "5.00" }],
  });
  await procurement.sendOrder(organizationId, order.id);
  const line = await testDb.procurementOrderLine.findFirstOrThrow({ where: { orderId: order.id } });
  await procurement.receiveOrderLine(organizationId, { orderId: order.id, lineId: line.id, quantity: 10 });
  return { vendor, order, line };
}

describe("Procurement supplier invoice protection (real Postgres)", () => {
  it("aggregates duplicate order lines before matching and rejects their combined over-invoice", async () => {
    const { vendor, order, line } = await createReceivedOrder(duplicateOrg.organizationId, "duplicates");

    await expect(procurement.createSupplierInvoice(duplicateOrg.organizationId, {
      vendorId: vendor.id,
      orderId: order.id,
      invoiceNumber: "DUP-OVER-1",
      invoiceDate: new Date("2026-04-02T00:00:00.000Z"),
      lines: [
        { orderLineId: line.id, quantity: 6, unitCost: "5.00" },
        { orderLineId: line.id, quantity: 5, unitCost: "5.00" },
      ],
    })).rejects.toBeInstanceOf(procurement.InvoiceMatchError);

    const rejectedInvoiceCount = await testDb.procurementSupplierInvoice.count({
      where: { organizationId: duplicateOrg.organizationId, invoiceNumber: "DUP-OVER-1" },
    });
    expect(rejectedInvoiceCount).toBe(0);

    const invoice = await procurement.createSupplierInvoice(duplicateOrg.organizationId, {
      vendorId: vendor.id,
      orderId: order.id,
      invoiceNumber: "DUP-VALID-1",
      invoiceDate: new Date("2026-04-02T00:00:00.000Z"),
      lines: [
        { orderLineId: line.id, quantity: 3, unitCost: "5.00" },
        { orderLineId: line.id, quantity: 3, unitCost: "5.00" },
      ],
    });
    expect(invoice.lines).toHaveLength(1);
    expect(invoice.lines[0].quantity).toBe(6);
    expect(invoice.totalAmount.toFixed(2)).toBe("30.00");
  });

  it("allows exactly one of two concurrent invoices that would over-invoice together", async () => {
    const { vendor, order, line } = await createReceivedOrder(invoiceRaceOrg.organizationId, "race");
    const invoiceInput = (invoiceNumber: string) => ({
      vendorId: vendor.id,
      orderId: order.id,
      invoiceNumber,
      invoiceDate: new Date("2026-04-02T00:00:00.000Z"),
      lines: [{ orderLineId: line.id, quantity: 6, unitCost: "5.00" }],
    });

    const results = await Promise.allSettled([
      procurement.createSupplierInvoice(invoiceRaceOrg.organizationId, invoiceInput("RACE-1")),
      procurement.createSupplierInvoice(invoiceRaceOrg.organizationId, invoiceInput("RACE-2")),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter((result) => result.status === "rejected") as PromiseRejectedResult[];
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(procurement.InvoiceMatchError);

    const invoices = await testDb.procurementSupplierInvoice.findMany({
      where: { organizationId: invoiceRaceOrg.organizationId, orderId: order.id },
      include: { lines: true },
    });
    expect(invoices).toHaveLength(1);
    expect(invoices[0].lines).toHaveLength(1);
    expect(invoices[0].lines[0].quantity).toBe(6);
  });
});
