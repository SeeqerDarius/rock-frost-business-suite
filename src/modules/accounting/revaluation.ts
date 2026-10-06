import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit";
import { convertToBase, ExchangeRateError } from "@/modules/globalization/fx";
import { resolveExchangeRate, toRateDate } from "@/modules/globalization/exchange-rates";
import { baseOutstanding, fxDifferenceLines, getBaseCurrency } from "./multi-currency";
import { ensureDefaultAccounts, ensureFxAccounts, postSourceJournalEntry } from "./service";

/**
 * Unrealized FX revaluation of open foreign-currency receivables and
 * payables at a reporting date.
 *
 * This is an explicit, user-initiated period-end action, never automatic.
 * It posts one revaluation journal dated `asOf` and an automatic reversal
 * dated the following day, so reported balances at `asOf` reflect the
 * closing rate while document carrying amounts, realized FX on later
 * settlement, and every historical document stay untouched. Posting is
 * idempotent per organization and date.
 */
export class RevaluationError extends Error {}

export type RevaluationLine = {
  kind: "RECEIVABLE" | "PAYABLE";
  documentId: string;
  documentNumber: string;
  counterparty: string;
  currency: string;
  openForeign: Prisma.Decimal;
  bookedRate: Prisma.Decimal;
  carryingBase: Prisma.Decimal;
  closingRate: Prisma.Decimal | null;
  revaluedBase: Prisma.Decimal | null;
  /** Positive = unrealized gain. */
  difference: Prisma.Decimal | null;
};

export async function previewRevaluation(organizationId: string, asOfInput: Date | string) {
  const asOf = toRateDate(asOfInput);
  const baseCurrency = await getBaseCurrency(organizationId);
  const [invoices, bills] = await Promise.all([
    db.accountingInvoice.findMany({ where: { organizationId, status: { in: ["SENT", "OVERDUE"] }, currency: { not: baseCurrency }, issueDate: { lte: endOfDay(asOf) } }, orderBy: { issueDate: "asc" } }),
    db.accountingBill.findMany({ where: { organizationId, status: { in: ["APPROVED", "PARTIALLY_PAID"] }, currency: { not: baseCurrency }, billDate: { lte: endOfDay(asOf) } }, orderBy: { billDate: "asc" } }),
  ]);

  const rates = new Map<string, Prisma.Decimal | null>();
  async function closingRate(currency: string) {
    if (!rates.has(currency)) {
      try {
        rates.set(currency, (await resolveExchangeRate(organizationId, currency, baseCurrency, asOf)).rate);
      } catch (error) {
        if (!(error instanceof ExchangeRateError)) throw error;
        rates.set(currency, null);
      }
    }
    return rates.get(currency) ?? null;
  }

  const lines: RevaluationLine[] = [];
  for (const invoice of invoices) {
    if (!invoice.currency) continue;
    const openForeign = invoice.amount.minus(invoice.amountPaid).minus(invoice.amountCredited);
    if (!openForeign.greaterThan(0)) continue;
    const carryingBase = baseOutstanding(invoice);
    const rate = await closingRate(invoice.currency);
    const revaluedBase = rate ? convertToBase(openForeign, rate) : null;
    lines.push({ kind: "RECEIVABLE", documentId: invoice.id, documentNumber: invoice.invoiceNumber, counterparty: invoice.customerName, currency: invoice.currency, openForeign, bookedRate: invoice.exchangeRate, carryingBase, closingRate: rate, revaluedBase, difference: revaluedBase ? revaluedBase.minus(carryingBase) : null });
  }
  for (const bill of bills) {
    if (!bill.currency) continue;
    const openForeign = bill.amount.minus(bill.amountPaid);
    if (!openForeign.greaterThan(0)) continue;
    const carryingBase = baseOutstanding(bill);
    const rate = await closingRate(bill.currency);
    const revaluedBase = rate ? convertToBase(openForeign, rate) : null;
    // A larger base-currency payable is a loss.
    lines.push({ kind: "PAYABLE", documentId: bill.id, documentNumber: bill.billNumber, counterparty: bill.supplierName, currency: bill.currency, openForeign, bookedRate: bill.exchangeRate, carryingBase, closingRate: rate, revaluedBase, difference: revaluedBase ? carryingBase.minus(revaluedBase) : null });
  }

  const missingRates = [...rates.entries()].filter(([, rate]) => !rate).map(([currency]) => currency);
  const receivableAdjustment = sum(lines.filter((line) => line.kind === "RECEIVABLE").map((line) => line.difference ?? new Prisma.Decimal(0)));
  // Positive payable gain means the base liability decreases.
  const payableGain = sum(lines.filter((line) => line.kind === "PAYABLE").map((line) => line.difference ?? new Prisma.Decimal(0)));
  const existing = await db.accountingJournalEntry.findFirst({ where: { organizationId, sourceType: "FX_REVALUATION", sourceId: revaluationSourceId(asOf), postingPurpose: "REVALUED" }, select: { id: true, postingNumber: true } });
  return { asOf, baseCurrency, lines, missingRates, receivableAdjustment, payableGain, netDifference: receivableAdjustment.plus(payableGain), alreadyPosted: existing };
}

export async function postRevaluation(organizationId: string, asOfInput: Date | string, actorId: string) {
  const preview = await previewRevaluation(organizationId, asOfInput);
  if (preview.alreadyPosted) throw new RevaluationError(`A revaluation is already posted for ${dateKey(preview.asOf)} (${preview.alreadyPosted.postingNumber}).`);
  if (preview.missingRates.length) throw new RevaluationError(`Record closing rates for ${preview.missingRates.join(", ")} on or before ${dateKey(preview.asOf)} first.`);
  if (preview.receivableAdjustment.isZero() && preview.payableGain.isZero()) throw new RevaluationError("There is no unrealized difference to post.");

  const [accounts, fxAccounts] = await Promise.all([ensureDefaultAccounts(organizationId), ensureFxAccounts(organizationId)]);
  const account = (code: string) => { const found = accounts.find((candidate) => candidate.code === code); if (!found) throw new Error(`Default account ${code} missing.`); return found.id; };
  const ar = account("1100");
  const ap = account("2000");

  const lines = [
    ...signedLine(ar, preview.receivableAdjustment),
    // A payable gain reduces the liability (debit).
    ...signedLine(ap, preview.payableGain),
    ...fxDifferenceLines(preview.netDifference, fxAccounts.unrealized),
  ];
  const reversalLines = lines.map((line) => ("debit" in line && line.debit ? { accountId: line.accountId, credit: line.debit } : { accountId: line.accountId, debit: (line as { credit: string }).credit }));
  const sourceId = revaluationSourceId(preview.asOf);
  const reversalDate = new Date(preview.asOf.getTime() + 24 * 60 * 60 * 1000);

  const entry = await postSourceJournalEntry(organizationId, { sourceModule: "accounting", sourceType: "FX_REVALUATION", sourceId, postingPurpose: "REVALUED", entryDate: preview.asOf, description: `Unrealized FX revaluation at ${dateKey(preview.asOf)}`, createdById: actorId, lines });
  const reversal = await postSourceJournalEntry(organizationId, { sourceModule: "accounting", sourceType: "FX_REVALUATION", sourceId, postingPurpose: "REVERSED", entryDate: reversalDate, description: `Reversal of unrealized FX revaluation at ${dateKey(preview.asOf)}`, createdById: actorId, lines: reversalLines });
  await logAuditEvent({ organizationId, userId: actorId, module: "accounting", action: "fx_revaluation.posted", entityName: "AccountingJournalEntry", entityId: entry.id, metadata: { asOf: dateKey(preview.asOf), documents: preview.lines.length, netDifference: preview.netDifference.toFixed(2), reversalEntryId: reversal.id } });
  return { entry, reversal, preview };
}

function signedLine(accountId: string, amount: Prisma.Decimal) {
  if (amount.isZero()) return [];
  return amount.isPositive() ? [{ accountId, debit: amount.toFixed(2) }] : [{ accountId, credit: amount.negated().toFixed(2) }];
}

function sum(values: Prisma.Decimal[]) {
  return values.reduce((total, value) => total.plus(value), new Prisma.Decimal(0));
}

function endOfDay(date: Date) {
  return new Date(date.getTime() + 24 * 60 * 60 * 1000 - 1);
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function revaluationSourceId(asOf: Date) {
  return `revaluation:${dateKey(asOf)}`;
}

export function assertRevaluationDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new RevaluationError("Choose a valid revaluation date.");
  return value;
}
