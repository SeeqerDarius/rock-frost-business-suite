import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("@/lib/db", () => ({ db: {} }));

const { engineTaxPrintDetails } = await import("@/modules/accounting/service");
const { buildPrintableDocumentPdf } = await import("@/lib/reports/invoice-pdf");

const d = (value: string) => new Prisma.Decimal(value);
const row = (taxRuleId: string | null, name: string, rate: string, treatment: string, taxable: string, tax: string) => ({ taxRuleId, name, rate: d(rate), treatment, taxableAmount: d(taxable), taxAmount: d(tax) });

describe("engineTaxPrintDetails", () => {
  it("labels each line with its rule's rate or treatment and summarises tax by component", () => {
    const rows = [
      row("std", "Germany standard VAT", "19.000000", "STANDARD", "100.00", "19.00"),
      row("red", "Germany reduced VAT", "7.000000", "REDUCED", "50.00", "3.50"),
      row("exe", "Germany standard VAT", "19.000000", "EXEMPT", "40.00", "0.00"),
    ];
    const details = engineTaxPrintDetails(rows, "std", [null, "red", "exe", "std"]);
    expect(details.lineLabels).toEqual(["19%", "7%", "Exempt", "19%"]);
    expect(details.summary.map((s) => [s.label, s.taxableAmount.toFixed(2), s.taxAmount.toFixed(2)])).toEqual([
      ["Germany standard VAT 19%", "100.00", "19.00"],
      ["Germany reduced VAT 7%", "50.00", "3.50"],
      ["Germany standard VAT (exempt)", "40.00", "0.00"],
    ]);
  });

  it("treats rows saved before per-line rules as the document rule and joins layered components", () => {
    const rows = [row(null, "VAT", "15", "STANDARD", "100.00", "15.00"), row(null, "NHIL", "2.5", "STANDARD", "100.00", "2.50")];
    const details = engineTaxPrintDetails(rows, "gh-standard", [null, null]);
    expect(details.lineLabels).toEqual(["15% + 2.5%", "15% + 2.5%"]);
    expect(details.summary).toHaveLength(2);
  });
});

describe("printable document with per-line tax", () => {
  it("renders a tax column and a tax summary", async () => {
    const buffer = await buildPrintableDocumentPdf({
      documentType: "INVOICE", documentNumber: "INV-0100", documentDate: new Date("2026-11-03T00:00:00.000Z"), organization: { name: "Berlin Supplies GmbH" },
      counterpartyLabel: "Bill to", counterpartyName: "Buchhandlung", currency: "EUR",
      lines: [{ description: "Printer", quantity: 1, unitPrice: 100, lineTotal: 100, taxLabel: "19%" }, { description: "Books", quantity: 2, unitPrice: 25, lineTotal: 50, taxLabel: "7%" }],
      taxableAmount: 150, vatAmount: 0, nhilAmount: 0, getfundAmount: 0, amount: 172.5,
      taxSummary: [{ label: "Germany standard VAT 19%", taxableAmount: 100, taxAmount: 19 }, { label: "Germany reduced VAT 7%", taxableAmount: 50, taxAmount: 3.5 }],
    });
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buffer.length).toBeGreaterThan(500);
  });
});
