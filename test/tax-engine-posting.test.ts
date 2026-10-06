import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("@/lib/db", () => ({ db: {} }));

const posting = await import("@/modules/accounting/engine-posting");

const D = (value: string | number) => new Prisma.Decimal(value);
type Line = Parameters<typeof posting.buildSalesPosting>[0]["lines"][number];

function taxLine(overrides: Partial<Line>): Line {
  return {
    code: "X", name: "X", taxKind: "VAT", jurisdictionCode: "XX", jurisdictionLevel: "COUNTRY", authorityName: null, rate: D(0), recoverable: true, treatment: "STANDARD",
    taxableAmount: D(0), taxAmount: D(0), selfAssessedAmount: D(0), outputAccountCode: null, inputAccountCode: null, ...overrides,
  };
}

const ACCOUNTS = new Map([["2100", "vat-out"], ["2110", "nhil-out"], ["2120", "getfund-out"], ["2140", "sales-tax"], ["1300", "vat-in"], ["1330", "other-in"]]);
const BASE = { currency: "GHS", isForeign: false, rate: 1 };

function balance(journal: { debit?: string; credit?: string }[]) {
  const debit = journal.reduce((sum, line) => sum.plus(line.debit ?? 0), D(0));
  const credit = journal.reduce((sum, line) => sum.plus(line.credit ?? 0), D(0));
  return { debit: debit.toFixed(2), credit: credit.toFixed(2) };
}

describe("engine sales posting", () => {
  it("posts each Ghana component to its own payable and maps them for the VAT working return", () => {
    const lines = [
      taxLine({ code: "GH-VAT", taxableAmount: D(100), taxAmount: D(15), outputAccountCode: "2100" }),
      taxLine({ code: "GH-NHIL", taxKind: "LEVY", taxableAmount: D(100), taxAmount: D("2.5"), outputAccountCode: "2110" }),
      taxLine({ code: "GH-GETFUND", taxKind: "LEVY", taxableAmount: D(100), taxAmount: D("2.5"), outputAccountCode: "2120" }),
    ];
    const result = posting.buildSalesPosting({ taxableAmount: D(100), amount: D(120), lines, fx: BASE, receivableAccountId: "ar", revenueAccountId: "rev", accountIds: ACCOUNTS });
    expect(result.journal.find((line) => line.accountId === "ar")?.debit).toBe("120.00");
    expect(result.journal.find((line) => line.accountId === "nhil-out")?.credit).toBe("2.50");
    expect(balance(result.journal).debit).toBe(balance(result.journal).credit);
    expect(result.legacy.vat.toFixed(2)).toBe("15.00");
    expect(result.legacy.nhil.toFixed(2)).toBe("2.50");
    expect(result.ledger).toHaveLength(3);
  });

  it("keeps US state and county sales tax in the sales tax payable account by default", () => {
    const lines = [
      taxLine({ code: "US-GA", taxKind: "SALES", jurisdictionCode: "US-GA", taxableAmount: D(200), taxAmount: D(8) }),
      taxLine({ code: "US-GA-FULTON", taxKind: "SALES", jurisdictionCode: "US-GA-FULTON", jurisdictionLevel: "COUNTY", taxableAmount: D(200), taxAmount: D(6) }),
    ];
    expect(posting.requiredTaxAccountCodes(lines, "SALE")).toEqual(["2140", "2140"]);
    const result = posting.buildSalesPosting({ taxableAmount: D(200), amount: D(214), lines, fx: { currency: "USD", isForeign: false, rate: 1 }, receivableAccountId: "ar", revenueAccountId: "rev", accountIds: ACCOUNTS });
    expect(result.journal.filter((line) => line.accountId === "sales-tax").map((line) => line.credit)).toEqual(["8.00", "6.00"]);
    // Sales tax is not VAT, so it never lands in the Ghana VAT working return.
    expect(result.legacy.vat.isZero()).toBe(true);
    expect(result.ledger.map((row) => row.jurisdictionCode)).toEqual(["US-GA", "US-GA-FULTON"]);
  });

  it("converts each component at the document rate for a foreign invoice and stays balanced", () => {
    const lines = [taxLine({ code: "EU-DE-STD", taxableAmount: D("100"), taxAmount: D("19"), outputAccountCode: "2100" })];
    const result = posting.buildSalesPosting({ taxableAmount: D(100), amount: D(119), lines, fx: { currency: "EUR", isForeign: true, rate: "17.333333" }, receivableAccountId: "ar", revenueAccountId: "rev", accountIds: ACCOUNTS });
    expect(result.journal.find((line) => line.accountId === "rev")?.credit).toBe("1733.33");
    expect(result.journal.find((line) => line.accountId === "vat-out")?.credit).toBe("329.33");
    expect(result.journal.find((line) => line.accountId === "ar")?.debit).toBe("2062.66");
    expect(result.journal.find((line) => line.accountId === "ar")?.transactionCurrency).toBe("EUR");
    const totals = balance(result.journal);
    expect(totals.debit).toBe(totals.credit);
  });

  it("records zero-rated and exempt lines in the ledger without posting tax", () => {
    const lines = [taxLine({ code: "GH-VAT", treatment: "EXEMPT", rate: D(15), taxableAmount: D(100), taxAmount: D(0) })];
    const result = posting.buildSalesPosting({ taxableAmount: D(100), amount: D(100), lines, fx: BASE, receivableAccountId: "ar", revenueAccountId: "rev", accountIds: ACCOUNTS });
    expect(result.journal).toHaveLength(2);
    expect(result.ledger[0]).toMatchObject({ treatment: "EXEMPT" });
    expect(result.ledger[0].taxableAmount.toFixed(2)).toBe("100.00");
  });
});

describe("engine purchase posting", () => {
  it("debits recoverable input VAT and credits the full payable", () => {
    const lines = [taxLine({ code: "EU-DE-STD", taxableAmount: D(100), taxAmount: D(19), outputAccountCode: "2100", inputAccountCode: "1300" })];
    const result = posting.buildPurchasePosting({ taxableAmount: D(100), amount: D(119), lines, fx: BASE, expenseAccountId: "exp", payableAccountId: "ap", accountIds: ACCOUNTS });
    expect(result.journal.find((line) => line.accountId === "exp")?.debit).toBe("100.00");
    expect(result.journal.find((line) => line.accountId === "vat-in")?.debit).toBe("19.00");
    expect(result.journal.find((line) => line.accountId === "ap")?.credit).toBe("119.00");
  });

  it("adds non-recoverable tax to the expense instead of input tax", () => {
    const lines = [taxLine({ code: "US-GA", taxKind: "SALES", recoverable: false, taxableAmount: D(100), taxAmount: D(4) })];
    const result = posting.buildPurchasePosting({ taxableAmount: D(100), amount: D(104), lines, fx: BASE, expenseAccountId: "exp", payableAccountId: "ap", accountIds: ACCOUNTS });
    expect(result.journal.find((line) => line.accountId === "exp")?.debit).toBe("104.00");
    expect(posting.requiredTaxAccountCodes(lines, "PURCHASE")).toEqual([]);
  });

  it("self-assesses reverse-charge VAT: input and output tax offset, supplier owed only the net", () => {
    const lines = [taxLine({ code: "EU-DE-STD", treatment: "REVERSE_CHARGE", rate: D(19), taxableAmount: D(1000), taxAmount: D(0), selfAssessedAmount: D(190), outputAccountCode: "2100", inputAccountCode: "1300" })];
    expect(posting.requiredTaxAccountCodes(lines, "PURCHASE").sort()).toEqual(["1300", "2100"]);
    const result = posting.buildPurchasePosting({ taxableAmount: D(1000), amount: D(1000), lines, fx: BASE, expenseAccountId: "exp", payableAccountId: "ap", accountIds: ACCOUNTS });
    expect(result.journal.find((line) => line.accountId === "ap")?.credit).toBe("1000.00");
    expect(result.journal.find((line) => line.accountId === "vat-in")?.debit).toBe("190.00");
    expect(result.journal.find((line) => line.accountId === "vat-out")?.credit).toBe("190.00");
    const totals = balance(result.journal);
    expect(totals.debit).toBe(totals.credit);
    expect(result.ledger[0].selfAssessedAmount.toFixed(2)).toBe("190.00");
  });

  it("reverses a journal by swapping sides", () => {
    expect(posting.reverseJournal([{ accountId: "a", debit: "10.00" }, { accountId: "b", credit: "10.00" }])).toEqual([{ accountId: "a", credit: "10.00" }, { accountId: "b", debit: "10.00" }]);
  });

  it("totals a document's base amount from converted parts", () => {
    expect(posting.engineBaseTotal("100", ["15", "2.5", "2.5"], { currency: "USD", isForeign: true, rate: "15.333333" }).toFixed(2)).toBe("1839.99");
  });
});
