import { describe, expect, it } from "vitest";
import { calculateTaxes, combineCalculations, TaxCalculationError, type TaxComponentInput } from "@/modules/tax/engine";

const component = (code: string, rate: string, extra: Partial<TaxComponentInput> = {}): TaxComponentInput => ({
  code, name: code, taxType: "VAT", jurisdictionCode: "XX", rate, ...extra,
});

const GHANA = [
  component("GH-VAT", "15", { jurisdictionCode: "GH" }),
  component("GH-NHIL", "2.5", { taxType: "LEVY", jurisdictionCode: "GH" }),
  component("GH-GETFUND", "2.5", { taxType: "LEVY", jurisdictionCode: "GH" }),
];

describe("tax engine: exclusive pricing", () => {
  it("adds each simple component to the taxable base (Ghana 2026 structure)", () => {
    const result = calculateTaxes({ amount: "100", components: GHANA });
    expect(result.lines.map((line) => line.taxAmount.toFixed(2))).toEqual(["15.00", "2.50", "2.50"]);
    expect(result.totalTax.toFixed(2)).toBe("20.00");
    expect(result.grossAmount.toFixed(2)).toBe("120.00");
  });

  it("layers US state, county, and city sales tax as separate jurisdiction lines", () => {
    const result = calculateTaxes({
      amount: "200",
      components: [
        component("US-GA", "4", { taxType: "SALES", jurisdictionCode: "US-GA", jurisdictionLevel: "STATE" }),
        component("US-GA-FULTON", "3", { taxType: "SALES", jurisdictionCode: "US-GA-FULTON", jurisdictionLevel: "COUNTY" }),
        component("US-GA-ATLANTA", "1.9", { taxType: "SALES", jurisdictionCode: "US-GA-ATLANTA", jurisdictionLevel: "CITY" }),
      ],
    });
    expect(result.lines.map((line) => [line.jurisdictionLevel, line.taxAmount.toFixed(2)])).toEqual([["STATE", "8.00"], ["COUNTY", "6.00"], ["CITY", "3.80"]]);
    expect(result.grossAmount.toFixed(2)).toBe("217.80");
  });

  it("applies compound components to the base plus simple taxes", () => {
    const result = calculateTaxes({ amount: "100", components: [component("BASE", "5"), component("COMPOUND", "10", { compound: true })] });
    expect(result.lines[1].taxableAmount.toFixed(2)).toBe("105.00");
    expect(result.lines[1].taxAmount.toFixed(2)).toBe("10.50");
    expect(result.grossAmount.toFixed(2)).toBe("115.50");
  });
});

describe("tax engine: inclusive pricing", () => {
  it("back-calculates the base so taxable plus tax equals the gross exactly", () => {
    const result = calculateTaxes({ amount: "120", components: GHANA, pricesIncludeTax: true });
    expect(result.taxableAmount.toFixed(2)).toBe("100.00");
    expect(result.grossAmount.toFixed(2)).toBe("120.00");
  });

  it("absorbs rounding in the last component for awkward amounts", () => {
    for (const gross of ["99.99", "10.01", "1234.57", "0.07"]) {
      const result = calculateTaxes({ amount: gross, components: GHANA, pricesIncludeTax: true });
      expect(result.taxableAmount.plus(result.totalTax).toFixed(2)).toBe(Number(gross).toFixed(2));
    }
  });

  it("handles compound components in inclusive mode", () => {
    const result = calculateTaxes({ amount: "115.50", components: [component("BASE", "5"), component("COMPOUND", "10", { compound: true })], pricesIncludeTax: true });
    expect(result.taxableAmount.toFixed(2)).toBe("100.00");
    expect(result.grossAmount.toFixed(2)).toBe("115.50");
  });

  it("treats German VAT-inclusive pricing correctly", () => {
    const result = calculateTaxes({ amount: "119", components: [component("EU-DE-STD", "19", { jurisdictionCode: "EU-DE" })], pricesIncludeTax: true });
    expect(result.taxableAmount.toFixed(2)).toBe("100.00");
    expect(result.totalTax.toFixed(2)).toBe("19.00");
  });
});

describe("tax engine: non-standard treatments", () => {
  it("records zero-rated sales with zero tax and a zero rate", () => {
    const result = calculateTaxes({ amount: "100", components: GHANA, treatment: "ZERO_RATED" });
    expect(result.totalTax.isZero()).toBe(true);
    expect(result.lines.every((line) => line.rate.isZero() && line.taxableAmount.toFixed(2) === "100.00")).toBe(true);
  });

  it("records exempt sales with zero tax while keeping the statutory rate for evidence", () => {
    const result = calculateTaxes({ amount: "100", components: GHANA, treatment: "EXEMPT" });
    expect(result.totalTax.isZero()).toBe(true);
    expect(result.lines[0].rate.toFixed(0)).toBe("15");
    expect(result.grossAmount.toFixed(2)).toBe("100.00");
  });

  it("charges nothing under reverse charge but returns the buyer's self-assessed amount", () => {
    const result = calculateTaxes({ amount: "1000", components: [component("EU-FR-STD", "20", { jurisdictionCode: "EU-FR" })], treatment: "REVERSE_CHARGE" });
    expect(result.totalTax.isZero()).toBe(true);
    expect(result.reverseCharge).toBe(true);
    expect(result.totalSelfAssessed.toFixed(2)).toBe("200.00");
  });
});

describe("tax engine: validation and aggregation", () => {
  it("rejects negative amounts and out-of-range rates", () => {
    expect(() => calculateTaxes({ amount: "-1", components: GHANA })).toThrow(TaxCalculationError);
    expect(() => calculateTaxes({ amount: "1", components: [component("BAD", "101")] })).toThrow(TaxCalculationError);
    expect(() => calculateTaxes({ amount: "1", components: [component("BAD", "abc")] })).toThrow(TaxCalculationError);
  });

  it("returns the amount unchanged when no components apply", () => {
    const result = calculateTaxes({ amount: "50", components: [] });
    expect(result.grossAmount.toFixed(2)).toBe("50.00");
    expect(result.lines).toHaveLength(0);
  });

  it("combines per-line calculations by component", () => {
    const standard = calculateTaxes({ amount: "100", components: [component("EU-DE-STD", "19")] });
    const reduced = calculateTaxes({ amount: "50", components: [component("EU-DE-RED", "7")] });
    const more = calculateTaxes({ amount: "100", components: [component("EU-DE-STD", "19")] });
    const combined = combineCalculations([standard, reduced, more]);
    expect(combined.lines).toHaveLength(2);
    expect(combined.lines.find((line) => line.code === "EU-DE-STD")?.taxAmount.toFixed(2)).toBe("38.00");
    expect(combined.totalTax.toFixed(2)).toBe("41.50");
    expect(combined.grossAmount.toFixed(2)).toBe("291.50");
  });
});
