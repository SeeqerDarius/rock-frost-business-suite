import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("@/lib/db", () => ({ db: {} }));

const mc = await import("@/modules/accounting/multi-currency");

const D = (value: string | number) => new Prisma.Decimal(value);

describe("document base components", () => {
  it("converts each component at the document rate and totals them exactly", () => {
    const base = mc.documentBaseComponents({ taxableAmount: "100.00", vatAmount: "15.00", nhilAmount: "2.50", getfundAmount: "2.50", exchangeRate: "15.333333" });
    expect(base.taxable.toFixed(2)).toBe("1533.33");
    expect(base.vat.toFixed(2)).toBe("230.00");
    expect(base.nhil.toFixed(2)).toBe("38.33");
    expect(base.getfund.toFixed(2)).toBe("38.33");
    // Total is the sum of rounded components, so the journal balances.
    expect(base.total.toFixed(2)).toBe("1839.99");
  });

  it("is the identity for base-currency documents (rate 1)", () => {
    const base = mc.documentBaseComponents({ taxableAmount: "100.00", vatAmount: "15.00", nhilAmount: "2.50", getfundAmount: "2.50" });
    expect(base.total.toFixed(2)).toBe("120.00");
  });
});

describe("settlement split", () => {
  it("posts a realized gain when a receivable is collected at a higher rate", () => {
    const split = mc.settlementSplit({ side: "RECEIVABLE", amount: "100", documentRate: "15", settlementRate: "16", remainingForeign: "100", remainingBase: "1500" });
    expect(split.baseAmount.toFixed(2)).toBe("1600.00");
    expect(split.settledBaseAmount.toFixed(2)).toBe("1500.00");
    expect(split.realizedFxAmount.toFixed(2)).toBe("100.00");
    expect(split.isFinal).toBe(true);
  });

  it("posts a realized loss when a payable is paid at a higher rate", () => {
    const split = mc.settlementSplit({ side: "PAYABLE", amount: "100", documentRate: "15", settlementRate: "16", remainingForeign: "100", remainingBase: "1500" });
    expect(split.realizedFxAmount.toFixed(2)).toBe("-100.00");
  });

  it("relieves exactly the remaining carrying amount on the final settlement, leaving no rounding residue", () => {
    const rate = "15.333333";
    const first = mc.settlementSplit({ side: "RECEIVABLE", amount: "33.33", documentRate: rate, settlementRate: rate, remainingForeign: "100", remainingBase: "1533.33" });
    const remainingBase = D("1533.33").minus(first.settledBaseAmount);
    const second = mc.settlementSplit({ side: "RECEIVABLE", amount: "66.67", documentRate: rate, settlementRate: rate, remainingForeign: "66.67", remainingBase });
    expect(first.settledBaseAmount.plus(second.settledBaseAmount).toFixed(2)).toBe("1533.33");
    // Same rate throughout, so any difference is only cent rounding.
    expect(first.realizedFxAmount.abs().lte(D("0.01"))).toBe(true);
    expect(second.realizedFxAmount.abs().lte(D("0.01"))).toBe(true);
  });

  it("produces no FX difference for base-currency documents", () => {
    const split = mc.settlementSplit({ side: "RECEIVABLE", amount: "40.00", documentRate: "1", settlementRate: "1", remainingForeign: "120", remainingBase: "120" });
    expect(split.realizedFxAmount.isZero()).toBe(true);
    expect(split.baseAmount.toFixed(2)).toBe("40.00");
  });
});

describe("journal helpers", () => {
  it("credits a gain account and debits a loss account", () => {
    const accounts = { gainAccountId: "gain", lossAccountId: "loss" };
    expect(mc.fxDifferenceLines(D("12.5"), accounts)).toEqual([{ accountId: "gain", credit: "12.50" }]);
    expect(mc.fxDifferenceLines(D("-3"), accounts)).toEqual([{ accountId: "loss", debit: "3.00" }]);
    expect(mc.fxDifferenceLines(D("0"), accounts)).toEqual([]);
  });

  it("records original currency metadata only on foreign lines", () => {
    expect(mc.lineFx({ currency: "USD", isForeign: true, rate: "15.5" }, "100")).toEqual({ transactionCurrency: "USD", transactionAmount: "100.00", exchangeRate: "15.5" });
    expect(mc.lineFx({ currency: "GHS", isForeign: false, rate: "1" }, "100")).toEqual({});
  });
});

describe("base-currency reporting values", () => {
  it("uses the stored base snapshot and settled amount", () => {
    const doc = { amount: "100", exchangeRate: "15", baseAmount: "1500", baseAmountSettled: "600", amountPaid: "40", amountCredited: "0" };
    expect(mc.baseTotal(doc).toFixed(2)).toBe("1500.00");
    expect(mc.baseOutstanding(doc).toFixed(2)).toBe("900.00");
  });

  it("falls back to settlements at the booked rate when the settled column is not loaded", () => {
    const doc = { amount: "100", exchangeRate: "15", amountPaid: "40", amountCredited: "10" };
    expect(mc.baseOutstanding(doc).toFixed(2)).toBe("750.00");
    expect(mc.atDocumentRate("40", doc).toFixed(2)).toBe("600.00");
  });

  it("never sums foreign amounts as if they were base currency", () => {
    const invoices = [
      { amount: "100", exchangeRate: "15", baseAmount: "1500" },
      { amount: "200", exchangeRate: "1", baseAmount: "200" },
    ];
    const total = invoices.reduce((sum, invoice) => sum.plus(mc.baseTotal(invoice)), D(0));
    expect(total.toFixed(2)).toBe("1700.00");
  });
});
