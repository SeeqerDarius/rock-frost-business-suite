import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit";
import { isValidCurrencyCode } from "@/lib/localization";
import { ExchangeRateError, invertRate, parseRate } from "@/modules/globalization/fx";

/**
 * Exchange-rate provider abstraction. Accounting asks for a rate through
 * resolveExchangeRate(); it never calls a live FX vendor directly. The
 * built-in provider reads the organization's own recorded rates. A live
 * provider (central bank feed, commercial API) can be registered later by
 * implementing this interface and recording its quotes as PROVIDER rows, so
 * every document still snapshots a rate that exists in the tenant's ledger.
 */
export interface ExchangeRateProvider {
  readonly name: string;
  getRate(input: { organizationId: string; fromCurrency: string; toCurrency: string; onDate: Date }): Promise<ResolvedRate | null>;
}

export type ResolvedRate = {
  fromCurrency: string;
  toCurrency: string;
  rate: Prisma.Decimal;
  rateDate: Date;
  source: "BASE" | "MANUAL" | "PROVIDER" | "INVERTED";
  exchangeRateId: string | null;
};

function normalizeCode(code: string): string {
  const value = code.trim().toUpperCase();
  if (!isValidCurrencyCode(value)) throw new ExchangeRateError(`${code} is not a supported ISO 4217 currency code.`);
  return value;
}

/** Calendar date at UTC midnight, matching the @db.Date column. */
export function toRateDate(value: Date | string): Date {
  const date = typeof value === "string" ? new Date(`${value.slice(0, 10)}T00:00:00.000Z`) : new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  if (Number.isNaN(date.getTime())) throw new ExchangeRateError("Rate date is invalid.");
  return date;
}

/** Latest recorded rate on or before the date; the newest correction wins for the same date. */
export const recordedRateProvider: ExchangeRateProvider = {
  name: "recorded",
  async getRate({ organizationId, fromCurrency, toCurrency, onDate }) {
    const direct = await db.exchangeRate.findFirst({
      where: { organizationId, fromCurrency, toCurrency, rateDate: { lte: onDate } },
      orderBy: [{ rateDate: "desc" }, { createdAt: "desc" }],
    });
    if (direct) return { fromCurrency, toCurrency, rate: new Prisma.Decimal(direct.rate), rateDate: direct.rateDate, source: direct.source, exchangeRateId: direct.id };
    const inverse = await db.exchangeRate.findFirst({
      where: { organizationId, fromCurrency: toCurrency, toCurrency: fromCurrency, rateDate: { lte: onDate } },
      orderBy: [{ rateDate: "desc" }, { createdAt: "desc" }],
    });
    if (inverse) return { fromCurrency, toCurrency, rate: invertRate(inverse.rate), rateDate: inverse.rateDate, source: "INVERTED", exchangeRateId: inverse.id };
    return null;
  },
};

const providers: ExchangeRateProvider[] = [recordedRateProvider];

export async function resolveExchangeRate(organizationId: string, fromCurrencyInput: string, toCurrencyInput: string, onDateInput: Date | string): Promise<ResolvedRate> {
  const fromCurrency = normalizeCode(fromCurrencyInput);
  const toCurrency = normalizeCode(toCurrencyInput);
  const onDate = toRateDate(onDateInput);
  if (fromCurrency === toCurrency) return { fromCurrency, toCurrency, rate: new Prisma.Decimal(1), rateDate: onDate, source: "BASE", exchangeRateId: null };
  for (const provider of providers) {
    const rate = await provider.getRate({ organizationId, fromCurrency, toCurrency, onDate });
    if (rate) return rate;
  }
  throw new ExchangeRateError(`No ${fromCurrency} to ${toCurrency} exchange rate is recorded on or before ${onDate.toISOString().slice(0, 10)}. Record a rate in Accounting settings first.`);
}

export async function recordExchangeRate(input: {
  organizationId: string;
  actorId: string;
  fromCurrency: string;
  toCurrency: string;
  rate: string;
  rateDate: Date | string;
  notes?: string | null;
}) {
  const fromCurrency = normalizeCode(input.fromCurrency);
  const toCurrency = normalizeCode(input.toCurrency);
  if (fromCurrency === toCurrency) throw new ExchangeRateError("Choose two different currencies.");
  const rate = parseRate(input.rate);
  const rateDate = toRateDate(input.rateDate);
  const notes = input.notes?.trim().slice(0, 500) || null;
  return db.$transaction(async (tx) => {
    const previous = await tx.exchangeRate.findFirst({
      where: { organizationId: input.organizationId, fromCurrency, toCurrency, rateDate },
      orderBy: { createdAt: "desc" },
      select: { id: true, rate: true },
    });
    const created = await tx.exchangeRate.create({
      data: { organizationId: input.organizationId, fromCurrency, toCurrency, rate, rateDate, source: "MANUAL", notes, createdById: input.actorId },
    });
    await logAuditEvent({
      organizationId: input.organizationId,
      userId: input.actorId,
      module: "accounting",
      action: previous ? "exchange_rate.corrected" : "exchange_rate.recorded",
      entityName: "ExchangeRate",
      entityId: created.id,
      metadata: { fromCurrency, toCurrency, rateDate: rateDate.toISOString().slice(0, 10), rate: rate.toString(), previousRate: previous?.rate.toString() ?? null, supersedesId: previous?.id ?? null },
    }, tx);
    return created;
  });
}

export async function listExchangeRates(organizationId: string, options: { page?: number; pageSize?: number; currency?: string | null } = {}) {
  const pageSize = Math.min(Math.max(options.pageSize ?? 25, 1), 100);
  const page = Math.max(options.page ?? 1, 1);
  const currency = options.currency?.trim().toUpperCase();
  const where: Prisma.ExchangeRateWhereInput = {
    organizationId,
    ...(currency && /^[A-Z]{3}$/.test(currency) ? { OR: [{ fromCurrency: currency }, { toCurrency: currency }] } : {}),
  };
  const [rows, total] = await Promise.all([
    db.exchangeRate.findMany({ where, orderBy: [{ rateDate: "desc" }, { createdAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize, include: { createdBy: { select: { name: true, email: true } } } }),
    db.exchangeRate.count({ where }),
  ]);
  return { rows, total, page, pageSize };
}
