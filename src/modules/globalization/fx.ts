import { Prisma } from "@prisma/client";

/**
 * Pure foreign-exchange arithmetic on decimals. Never use JavaScript numbers
 * for these values: binary floating point cannot represent most cent
 * amounts exactly.
 *
 * Convention: a rate means 1 unit of the transaction (foreign) currency
 * equals `rate` units of the organization's base currency.
 */
export class ExchangeRateError extends Error {}

export type Decimalish = Prisma.Decimal.Value;

export function parseRate(value: Decimalish): Prisma.Decimal {
  let rate: Prisma.Decimal;
  try {
    rate = new Prisma.Decimal(value);
  } catch {
    throw new ExchangeRateError("Exchange rate must be a number.");
  }
  if (!rate.isFinite() || rate.lte(0)) throw new ExchangeRateError("Exchange rate must be greater than zero.");
  if (rate.decimalPlaces() > 10) throw new ExchangeRateError("Exchange rate supports at most 10 decimal places.");
  if (rate.gte(new Prisma.Decimal("10000000000"))) throw new ExchangeRateError("Exchange rate is too large.");
  return rate;
}

/** Base-currency equivalent, rounded half-up to the cent. */
export function convertToBase(amount: Decimalish, rate: Decimalish): Prisma.Decimal {
  return new Prisma.Decimal(amount).mul(parseRate(rate)).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/** Inverse of a stored rate (e.g. GHS→USD from a USD→GHS rate), kept at 10 dp. */
export function invertRate(rate: Decimalish): Prisma.Decimal {
  return new Prisma.Decimal(1).div(parseRate(rate)).toDecimalPlaces(10, Prisma.Decimal.ROUND_HALF_UP);
}

/**
 * Realized FX difference when a foreign-currency document is settled at a
 * different rate than it was booked at. Positive = gain, negative = loss.
 *
 * For a receivable, more base currency received than booked is a gain. For
 * a payable, more base currency paid than booked is a loss.
 */
export function realizedFxDifference(input: {
  side: "RECEIVABLE" | "PAYABLE";
  settledForeignAmount: Decimalish;
  bookedRate: Decimalish;
  settlementRate: Decimalish;
}): Prisma.Decimal {
  const booked = convertToBase(input.settledForeignAmount, input.bookedRate);
  const settled = convertToBase(input.settledForeignAmount, input.settlementRate);
  const delta = settled.minus(booked);
  return input.side === "RECEIVABLE" ? delta : delta.negated();
}

/**
 * Unrealized FX difference for an open foreign balance revalued at a
 * reporting date. Same sign convention as realizedFxDifference().
 */
export function unrealizedFxDifference(input: {
  side: "RECEIVABLE" | "PAYABLE";
  openForeignAmount: Decimalish;
  carryingRate: Decimalish;
  revaluationRate: Decimalish;
}): Prisma.Decimal {
  return realizedFxDifference({ side: input.side, settledForeignAmount: input.openForeignAmount, bookedRate: input.carryingRate, settlementRate: input.revaluationRate });
}

/** Immutable record a document stores at the moment it is created/posted. */
export type FxSnapshot = {
  currency: string;
  baseCurrency: string;
  rate: Prisma.Decimal;
  rateDate: Date;
  rateSource: string;
  baseAmount: Prisma.Decimal;
};

export function buildFxSnapshot(input: { amount: Decimalish; currency: string; baseCurrency: string; rate: Decimalish; rateDate: Date; rateSource: string }): FxSnapshot {
  const currency = input.currency.toUpperCase();
  const baseCurrency = input.baseCurrency.toUpperCase();
  const rate = currency === baseCurrency ? new Prisma.Decimal(1) : parseRate(input.rate);
  return { currency, baseCurrency, rate, rateDate: input.rateDate, rateSource: currency === baseCurrency ? "BASE" : input.rateSource, baseAmount: convertToBase(input.amount, rate) };
}
