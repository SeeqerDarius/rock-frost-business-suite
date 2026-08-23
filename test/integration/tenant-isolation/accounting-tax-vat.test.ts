import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as accounting from "@/modules/accounting/service";
import * as procurement from "@/modules/procurement/service";
import { listTaxCodes, getTaxReturnWorkingReport, createTaxPeriod } from "@/modules/accounting/tax-service";
import { testDb } from "../setup/db";
import { cleanupTestOrg, createTestOrg, type TestOrg } from "../setup/fixtures";

let org: TestOrg;
let standardTaxCodeId: string;

beforeAll(async () => {
  org = await createTestOrg("accounting-tax-vat");
  await testDb.organization.update({ where: { id: org.organizationId }, data: { country: "GH", currency: "GHS" } });
  const codes = await listTaxCodes(org.organizationId);
  standardTaxCodeId = codes.find((code) => code.code === "GH-STD-2026")!.id;
});

afterAll(async () => { await cleanupTestOrg(org); });

describe("Ghana VAT foundation (real Postgres)", () => {
  it("posts output VAT, NHIL, and GETFund separately for a customer invoice", async () => {
    const invoice = await accounting.createInvoice(org.organizationId, { customerName: "Taxable Customer", amount: "100.00", issueDate: new Date("2026-08-05"), dueDate: new Date("2026-08-31"), taxCodeId: standardTaxCodeId }, org.userId);
    expect(invoice.taxableAmount.toFixed(2)).toBe("100.00");
    expect(invoice.amount.toFixed(2)).toBe("120.00");
    expect(invoice.vatAmount.toFixed(2)).toBe("15.00");
    expect(invoice.nhilAmount.toFixed(2)).toBe("2.50");
    expect(invoice.getfundAmount.toFixed(2)).toBe("2.50");
    await accounting.markInvoiceSent(org.organizationId, invoice.id);
    const evidence = await testDb.accountingTaxTransaction.findUniqueOrThrow({ where: { organizationId_sourceType_sourceId_direction: { organizationId: org.organizationId, sourceType: "ACCOUNTING_INVOICE", sourceId: invoice.id, direction: "OUTPUT" } } });
    expect(evidence.vatAmount.toFixed(2)).toBe("15.00");
    const entry = await testDb.accountingJournalEntry.findFirstOrThrow({ where: { organizationId: org.organizationId, sourceType: "INVOICE", sourceId: invoice.id }, include: { lines: { include: { account: true } } } });
    expect(entry.lines.find((line) => line.account.code === "1100")?.debit.toFixed(2)).toBe("120.00");
    expect(entry.lines.find((line) => line.account.code === "2100")?.credit.toFixed(2)).toBe("15.00");
  }, 60_000);

  it("posts recoverable input tax from Procurement and includes both sides in the monthly working return", async () => {
    const vendor = await procurement.createVendor(org.organizationId, { name: "VAT Vendor" });
    const order = await procurement.createOrder(org.organizationId, { vendorId: vendor.id, orderDate: new Date("2026-08-06"), lines: [{ description: "Taxable stock", quantity: 2, unitCost: "50.00" }] });
    await procurement.sendOrder(org.organizationId, order.id);
    const line = await testDb.procurementOrderLine.findFirstOrThrow({ where: { orderId: order.id } });
    await procurement.receiveOrderLine(org.organizationId, { orderId: order.id, lineId: line.id, quantity: 2 });
    const invoice = await procurement.createSupplierInvoice(org.organizationId, { vendorId: vendor.id, orderId: order.id, invoiceNumber: `VAT-${Date.now()}`, invoiceDate: new Date("2026-08-06"), taxCodeId: standardTaxCodeId, lines: [{ orderLineId: line.id, quantity: 2, unitCost: "50.00" }] });
    expect(invoice.totalAmount.toFixed(2)).toBe("120.00");
    await procurement.reviewSupplierInvoice(org.organizationId, invoice.id, org.userId, "APPROVE");
    const inputEvidence = await testDb.accountingTaxTransaction.findUniqueOrThrow({ where: { organizationId_sourceType_sourceId_direction: { organizationId: org.organizationId, sourceType: "PROCUREMENT_SUPPLIER_INVOICE", sourceId: invoice.id, direction: "INPUT" } } });
    expect(inputEvidence.getfundAmount.toFixed(2)).toBe("2.50");
    const period = await createTaxPeriod(org.organizationId, { name: "August 2026 VAT", jurisdiction: "GH", startDate: new Date("2026-08-01"), endDate: new Date("2026-08-31T23:59:59.999Z"), filingDueDate: new Date("2026-09-30") });
    const report = await getTaxReturnWorkingReport(org.organizationId, period.id);
    expect(report.output.totalTax.toFixed(2)).toBe("20.00");
    expect(report.input.totalTax.toFixed(2)).toBe("20.00");
    expect(report.net.totalTax.toFixed(2)).toBe("0.00");
  }, 60_000);
});
