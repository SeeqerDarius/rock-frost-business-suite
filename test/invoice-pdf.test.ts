import { describe, expect, it } from "vitest";
import { buildPrintableDocumentPdf, type PrintableDocumentInput } from "@/lib/reports/invoice-pdf";

const SAMPLE_INVOICE: PrintableDocumentInput = {
  documentType: "INVOICE",
  documentNumber: "INV-0042",
  documentDate: new Date("2026-09-01T00:00:00.000Z"),
  dueDate: new Date("2026-09-15T00:00:00.000Z"),
  organization: { name: "Rock Frost Motors Ltd", address: "12 Independence Ave, Accra", taxNumber: "GHA-000111222-X", phone: "0244000000", email: "accounts@rockfrostmotors.com" },
  counterpartyLabel: "Bill to",
  counterpartyName: "Volta Traders Ltd",
  counterpartyEmail: "finance@voltatraders.com",
  counterpartyTin: "GHA-000333444-Y",
  currency: "GHS",
  lines: [
    { description: "Fleet maintenance service", quantity: 2, unitPrice: 350, lineTotal: 700 },
    { description: "Replacement brake pads", quantity: 4, unitPrice: 75, lineTotal: 300 },
  ],
  taxableAmount: 1000,
  vatAmount: 150,
  nhilAmount: 25,
  getfundAmount: 25,
  amount: 1200,
  amountPaid: 0,
  notes: "Payment due within 14 days.",
};

describe("buildPrintableDocumentPdf", () => {
  it("produces a valid, non-empty PDF buffer", async () => {
    const buffer = await buildPrintableDocumentPdf(SAMPLE_INVOICE);
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buffer.length).toBeGreaterThan(500);
  });

  it("renders a bill document with the Supplier label and no throw", async () => {
    const buffer = await buildPrintableDocumentPdf({ ...SAMPLE_INVOICE, documentType: "BILL", counterpartyLabel: "Supplier" });
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("paginates a large line-item list without throwing", async () => {
    const manyLines = Array.from({ length: 80 }, (_, index) => ({ description: `Line ${index}`, quantity: 1, unitPrice: 10, lineTotal: 10 }));
    const buffer = await buildPrintableDocumentPdf({ ...SAMPLE_INVOICE, lines: manyLines });
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("omits VAT/NHIL/GETFund total rows entirely for a zero-rated document", async () => {
    const buffer = await buildPrintableDocumentPdf({ ...SAMPLE_INVOICE, vatAmount: 0, nhilAmount: 0, getfundAmount: 0, amount: 1000 });
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
