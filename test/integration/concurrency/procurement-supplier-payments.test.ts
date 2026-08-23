import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as procurement from "@/modules/procurement/service";
import { ensureDefaultAccounts } from "@/modules/accounting/service";
import { testDb } from "../setup/db";
import { cleanupTestOrg, createTestOrg, type TestOrg } from "../setup/fixtures";

let org: TestOrg;

beforeAll(async () => { org = await createTestOrg("procurement-supplier-payments"); });
afterAll(async () => { await cleanupTestOrg(org); });

async function approvedInvoice() {
  const vendor = await procurement.createVendor(org.organizationId, { name: `Payable Vendor ${Date.now()}` });
  const order = await procurement.createOrder(org.organizationId, { vendorId: vendor.id, orderDate: new Date("2026-08-01"), lines: [{ description: "Stock", quantity: 10, unitCost: "10.00" }] });
  await procurement.sendOrder(org.organizationId, order.id);
  const line = await testDb.procurementOrderLine.findFirstOrThrow({ where: { orderId: order.id } });
  await procurement.receiveOrderLine(org.organizationId, { orderId: order.id, lineId: line.id, quantity: 10 });
  const invoice = await procurement.createSupplierInvoice(org.organizationId, { vendorId: vendor.id, orderId: order.id, invoiceNumber: `PAY-${Date.now()}-${Math.random()}`, invoiceDate: new Date("2026-08-02"), dueDate: new Date("2026-09-01"), lines: [{ orderLineId: line.id, quantity: 10, unitCost: "10.00" }] });
  return procurement.reviewSupplierInvoice(org.organizationId, invoice.id, org.userId, "APPROVE");
}

describe("Procurement supplier payments (real Postgres)", () => {
  it("records a partial payment and posts the payable movement", async () => {
    const invoice = await approvedInvoice();
    const cash = (await ensureDefaultAccounts(org.organizationId)).find((account) => account.code === "1000")!;
    await procurement.recordSupplierPayment(org.organizationId, { invoiceId: invoice.id, accountId: cash.id, paymentMethod: "CASH", amount: "40.00", paymentDate: new Date("2026-08-03"), createdById: org.userId });
    const saved = await testDb.procurementSupplierInvoice.findUniqueOrThrow({ where: { id: invoice.id }, include: { payments: true } });
    expect(saved.status).toBe("PARTIALLY_PAID");
    expect(saved.amountPaid.toFixed(2)).toBe("40.00");
    expect(saved.payments).toHaveLength(1);
    expect(await testDb.accountingJournalEntry.count({ where: { organizationId: org.organizationId, sourceType: "PROCUREMENT_SUPPLIER_PAYMENT", sourceId: saved.payments[0].id } })).toBe(1);
  }, 60_000);

  it("serializes concurrent payments so the invoice cannot be overpaid", async () => {
    const invoice = await approvedInvoice();
    const cash = (await ensureDefaultAccounts(org.organizationId)).find((account) => account.code === "1000")!;
    const input = { invoiceId: invoice.id, accountId: cash.id, paymentMethod: "CASH", amount: "60.00", paymentDate: new Date("2026-08-03"), createdById: org.userId };
    const results = await Promise.allSettled([procurement.recordSupplierPayment(org.organizationId, input), procurement.recordSupplierPayment(org.organizationId, input)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const saved = await testDb.procurementSupplierInvoice.findUniqueOrThrow({ where: { id: invoice.id }, include: { payments: true } });
    expect(saved.amountPaid.toFixed(2)).toBe("60.00");
    expect(saved.payments).toHaveLength(1);
  }, 60_000);
});
