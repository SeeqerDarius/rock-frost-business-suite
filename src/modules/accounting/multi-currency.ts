import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { isValidCurrencyCode } from "@/lib/localization";
import { convertToBase, ExchangeRateError, parseRate, type Decimalish } from "@/modules/globalization/fx";
import { resolveExchangeRate, toRateDate } from "@/modules/globalization/exchange-rates";

/**
 * Multi-currency rules for Accounting documents.
 *
 * - A document's amounts (lines, tax, totals, paid/credited) are kept in the
 *   document currency.
 * - The exchange rate is resolved once, server-side, when the document is
 *   created (from the organization's recorded rates or an explicit rate the
 *   user entered) and is never recalculated. Ledger postings convert each
 *   component with that stored rate, so a void or reversal reproduces the
 *   original base amounts exactly.
 * - Settlement (payment or credit) relieves the receivable/payable at the
 *   document's booked rate; the difference from the settlement-rate value is
 *   realized FX gain or loss. The final settlement relieves exactly the
 *   remaining base carrying amount, so rounding never leaves residue.
 * - Base-currency documents use rate 1 and post exactly as before.
 */

export const FX_ACCOUNT_CODES = {
  realizedGain: "4810",
  realizedLoss: "5810",
  unrealizedGain: "4820",
  unrealizedLoss: "5820",
} as const;

export type DocumentFx = {
  currency: string;
  baseCurrency: string;
  rate: Prisma.Decimal;
  rateDate: Date;
  rateSource: string;
  isForeign: boolean;
};

export async function getBaseCurrency(organizationId: string, client: Pick<typeof db, "organization"> = db): Promise<string> {
  const organization = await client.organization.findUnique({ where: { id: organizationId }, select: { currency: true } });
  if (!organization) throw new ExchangeRateError("Organization not found.");
  return organization.currency;
}

/**
 * Resolves the currency and rate a new document (or a settlement) uses.
 * `manualRate` is an explicit rate the user entered (for example the rate
 * on a bank advice); it is validated and recorded as MANUAL_ENTRY.
 */
export async function resolveDocumentFx(organizationId: string, input: { currency?: string | null; date: Date; manualRate?: string | null; baseCurrency?: string }): Promise<DocumentFx> {
  const baseCurrency = input.baseCurrency ?? await getBaseCurrency(organizationId);
  const currency = input.currency?.trim().toUpperCase() || baseCurrency;
  if (!isValidCurrencyCode(currency)) throw new ExchangeRateError(`${currency} is not a supported ISO 4217 currency code.`);
  const rateDate = toRateDate(input.date);
  if (currency === baseCurrency) return { currency, baseCurrency, rate: new Prisma.Decimal(1), rateDate, rateSource: "BASE", isForeign: false };
  if (input.manualRate?.trim()) return { currency, baseCurrency, rate: parseRate(input.manualRate.trim()), rateDate, rateSource: "MANUAL_ENTRY", isForeign: true };
  const resolved = await resolveExchangeRate(organizationId, currency, baseCurrency, rateDate);
  return { currency, baseCurrency, rate: resolved.rate, rateDate: resolved.rateDate, rateSource: resolved.source, isForeign: true };
}

type TaxedAmounts = { taxableAmount: Decimalish; vatAmount: Decimalish; nhilAmount: Decimalish; getfundAmount: Decimalish; exchangeRate?: Decimalish | null };

/** Base-currency value of each posted component; total is their exact sum, so journals always balance. */
export function documentBaseComponents(doc: TaxedAmounts) {
  const rate = doc.exchangeRate ?? 1;
  const taxable = convertToBase(doc.taxableAmount, rate);
  const vat = convertToBase(doc.vatAmount, rate);
  const nhil = convertToBase(doc.nhilAmount, rate);
  const getfund = convertToBase(doc.getfundAmount, rate);
  return { taxable, vat, nhil, getfund, total: taxable.plus(vat).plus(nhil).plus(getfund) };
}

/**
 * Splits a settlement of `amount` (document currency) into the base value
 * actually received/paid and the carrying amount it relieves.
 */
export function settlementSplit(input: {
  side: "RECEIVABLE" | "PAYABLE";
  amount: Decimalish;
  documentRate: Decimalish;
  settlementRate: Decimalish;
  remainingForeign: Decimalish;
  remainingBase: Decimalish;
}) {
  const amount = new Prisma.Decimal(input.amount);
  const isFinal = amount.equals(new Prisma.Decimal(input.remainingForeign));
  const settledBaseAmount = isFinal ? new Prisma.Decimal(input.remainingBase) : convertToBase(amount, input.documentRate);
  const baseAmount = convertToBase(amount, input.settlementRate);
  const realizedFxAmount = input.side === "RECEIVABLE" ? baseAmount.minus(settledBaseAmount) : settledBaseAmount.minus(baseAmount);
  return { baseAmount, settledBaseAmount, realizedFxAmount, isFinal };
}

/** Journal lines for a realized or unrealized FX difference (positive = gain). */
export function fxDifferenceLines(amount: Prisma.Decimal, accounts: { gainAccountId: string; lossAccountId: string }) {
  if (amount.isZero()) return [];
  return amount.isPositive()
    ? [{ accountId: accounts.gainAccountId, credit: amount.toFixed(2) }]
    : [{ accountId: accounts.lossAccountId, debit: amount.negated().toFixed(2) }];
}

/** Original-currency metadata stored on a converted journal line. */
export function lineFx(fx: { currency: string | null; isForeign: boolean; rate: Decimalish }, transactionAmount: Decimalish) {
  if (!fx.isForeign || !fx.currency) return {};
  return { transactionCurrency: fx.currency, transactionAmount: new Prisma.Decimal(transactionAmount).toFixed(2), exchangeRate: new Prisma.Decimal(fx.rate).toString() };
}

type BaseValued = { amount: Decimalish; exchangeRate?: Decimalish | null; baseAmount?: Decimalish | null; baseAmountSettled?: Decimalish | null; amountPaid?: Decimalish | null; amountCredited?: Decimalish | null };

/** Base-currency total of a document (stored snapshot, falling back to amount at its rate). */
export function baseTotal(doc: BaseValued): Prisma.Decimal {
  return doc.baseAmount !== null && doc.baseAmount !== undefined ? new Prisma.Decimal(doc.baseAmount) : convertToBase(doc.amount, doc.exchangeRate ?? 1);
}

/** Base-currency carrying amount still open on a receivable/payable. */
export function baseOutstanding(doc: BaseValued): Prisma.Decimal {
  // When the settled carrying amount was not selected, derive it from the
  // document-currency settlements at the booked rate.
  const settled = doc.baseAmountSettled !== null && doc.baseAmountSettled !== undefined
    ? new Prisma.Decimal(doc.baseAmountSettled)
    : convertToBase(new Prisma.Decimal(doc.amountPaid ?? 0).plus(doc.amountCredited ?? 0), doc.exchangeRate ?? 1);
  return baseTotal(doc).minus(settled);
}

/** Converts a document-currency figure (e.g. amountPaid) at the document's booked rate. */
export function atDocumentRate(value: Decimalish, doc: { exchangeRate?: Decimalish | null }): Prisma.Decimal {
  return convertToBase(value, doc.exchangeRate ?? 1);
}
