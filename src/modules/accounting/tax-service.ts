import "server-only";

import { Prisma, type AccountingTaxTreatment } from "@prisma/client";
import { db } from "@/lib/db";

export class TaxConfigurationError extends Error {}
export class TaxPeriodStateError extends Error {}

const GHANA_2026_EFFECTIVE = new Date("2026-01-01T00:00:00.000Z");

export async function ensureJurisdictionTaxCodes(organizationId: string) {
  const organization = await db.organization.findUnique({ where: { id: organizationId }, select: { country: true } });
  if (!organization) throw new TaxConfigurationError("Organization not found.");
  const jurisdiction = organization.country?.trim().toUpperCase() === "GH" || organization.country?.trim().toUpperCase() === "GHANA" ? "GH" : "GLOBAL";
  const definitions = jurisdiction === "GH"
    ? [
        { code: "GH-STD-2026", name: "Ghana standard VAT 2026", treatment: "STANDARD" as const, vatRate: "15", nhilRate: "2.5", getfundRate: "2.5", effectiveFrom: GHANA_2026_EFFECTIVE },
        { code: "GH-ZERO-2026", name: "Ghana zero-rated supply", treatment: "ZERO_RATED" as const, vatRate: "0", nhilRate: "0", getfundRate: "0", effectiveFrom: GHANA_2026_EFFECTIVE },
        { code: "GH-EXEMPT-2026", name: "Ghana exempt supply", treatment: "EXEMPT" as const, vatRate: "0", nhilRate: "0", getfundRate: "0", effectiveFrom: GHANA_2026_EFFECTIVE },
      ]
    : [{ code: "NO-TAX", name: "No tax configured", treatment: "OUT_OF_SCOPE" as const, vatRate: "0", nhilRate: "0", getfundRate: "0", effectiveFrom: new Date("2000-01-01T00:00:00.000Z") }];
  await db.accountingTaxCode.createMany({ data: definitions.map((definition) => ({ organizationId, jurisdiction, isSystem: true, ...definition })), skipDuplicates: true });
  return db.accountingTaxCode.findMany({ where: { organizationId }, orderBy: [{ active: "desc" }, { effectiveFrom: "desc" }, { code: "asc" }] });
}

export async function listTaxCodes(organizationId: string) {
  await ensureJurisdictionTaxCodes(organizationId);
  return db.accountingTaxCode.findMany({ where: { organizationId }, orderBy: [{ active: "desc" }, { effectiveFrom: "desc" }, { code: "asc" }] });
}

export async function createTaxCode(organizationId: string, data: { code: string; name: string; jurisdiction: string; treatment: AccountingTaxTreatment; vatRate: string; nhilRate: string; getfundRate: string; withholdingRate?: string; withholdingCategory?: "GOODS" | "SERVICES" | "RENT" | null; effectiveFrom: Date; effectiveTo?: Date | null }) {
  const rates = [data.vatRate, data.nhilRate, data.getfundRate, data.withholdingRate ?? "0"].map((rate) => new Prisma.Decimal(rate));
  if (rates.some((rate) => !rate.isFinite() || rate.isNegative() || rate.greaterThan(100))) throw new TaxConfigurationError("Tax rates must be between 0 and 100 percent.");
  if (data.effectiveTo && data.effectiveTo < data.effectiveFrom) throw new TaxConfigurationError("The effective end date cannot precede the start date.");
  return db.accountingTaxCode.create({ data: { organizationId, ...data, withholdingRate: data.withholdingRate ?? "0", code: data.code.trim().toUpperCase(), jurisdiction: data.jurisdiction.trim().toUpperCase(), name: data.name.trim() } });
}

export async function calculateTax(organizationId: string, taxableAmountInput: Prisma.Decimal.Value, taxCodeId?: string | null, transactionDate = new Date()) {
  const taxableAmount = new Prisma.Decimal(taxableAmountInput);
  if (!taxableAmount.isFinite() || taxableAmount.isNegative()) throw new TaxConfigurationError("Taxable amount must be zero or greater.");
  if (!taxCodeId) return { taxCode: null, taxableAmount, vatAmount: new Prisma.Decimal(0), nhilAmount: new Prisma.Decimal(0), getfundAmount: new Prisma.Decimal(0), totalTax: new Prisma.Decimal(0), grossAmount: taxableAmount };
  const taxCode = await db.accountingTaxCode.findFirst({ where: { id: taxCodeId, organizationId, active: true, effectiveFrom: { lte: transactionDate }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: transactionDate } }] } });
  if (!taxCode) throw new TaxConfigurationError("The selected tax code is not active for the transaction date.");
  const vatAmount = taxableAmount.mul(taxCode.vatRate).div(100).toDecimalPlaces(2);
  const nhilAmount = taxableAmount.mul(taxCode.nhilRate).div(100).toDecimalPlaces(2);
  const getfundAmount = taxableAmount.mul(taxCode.getfundRate).div(100).toDecimalPlaces(2);
  const totalTax = vatAmount.plus(nhilAmount).plus(getfundAmount);
  return { taxCode, taxableAmount, vatAmount, nhilAmount, getfundAmount, totalTax, grossAmount: taxableAmount.plus(totalTax) };
}

/**
 * The inclusive-mode counterpart to calculateTax(): back-calculates the tax
 * component from a gross amount that already includes VAT/NHIL/GETFund,
 * instead of adding tax on top of a taxable amount. getfundAmount absorbs
 * whatever cent of rounding remains after taxableAmount is rounded, so
 * taxableAmount + vatAmount + nhilAmount + getfundAmount always reconciles
 * exactly to grossAmount - the invariant a balanced journal posting depends
 * on. For the same underlying taxable amount, calculateTax()'s forward
 * calculation and this function's inverse calculation on its resulting
 * grossAmount agree exactly whenever the taxable amount was already rounded
 * to the cent (the case for every real line total).
 */
export async function calculateTaxInclusive(organizationId: string, grossAmountInput: Prisma.Decimal.Value, taxCodeId?: string | null, transactionDate = new Date()) {
  const grossAmount = new Prisma.Decimal(grossAmountInput);
  if (!grossAmount.isFinite() || grossAmount.isNegative()) throw new TaxConfigurationError("Amount must be zero or greater.");
  if (!taxCodeId) return { taxCode: null, taxableAmount: grossAmount, vatAmount: new Prisma.Decimal(0), nhilAmount: new Prisma.Decimal(0), getfundAmount: new Prisma.Decimal(0), totalTax: new Prisma.Decimal(0), grossAmount };
  const taxCode = await db.accountingTaxCode.findFirst({ where: { id: taxCodeId, organizationId, active: true, effectiveFrom: { lte: transactionDate }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: transactionDate } }] } });
  if (!taxCode) throw new TaxConfigurationError("The selected tax code is not active for the transaction date.");
  const totalRate = new Prisma.Decimal(taxCode.vatRate).plus(taxCode.nhilRate).plus(taxCode.getfundRate);
  const taxableAmount = grossAmount.div(totalRate.div(100).plus(1)).toDecimalPlaces(2);
  const totalTax = grossAmount.minus(taxableAmount);
  const vatAmount = taxableAmount.mul(taxCode.vatRate).div(100).toDecimalPlaces(2);
  const nhilAmount = taxableAmount.mul(taxCode.nhilRate).div(100).toDecimalPlaces(2);
  const getfundAmount = totalTax.minus(vatAmount).minus(nhilAmount);
  return { taxCode, taxableAmount, vatAmount, nhilAmount, getfundAmount, totalTax, grossAmount };
}

/** A worked example (GHS 500 at Ghana's standard 15/2.5/2.5 rates) for callers
 * that need to show a manager what withholding tax will deduct from a bill
 * payment before they confirm it - not itself a posting function. */
export function calculateWithholdingTax(baseAmountInput: Prisma.Decimal.Value, withholdingRate: Prisma.Decimal.Value) {
  const baseAmount = new Prisma.Decimal(baseAmountInput);
  const rate = new Prisma.Decimal(withholdingRate);
  const withheld = rate.greaterThan(0) ? baseAmount.mul(rate).div(100).toDecimalPlaces(2) : new Prisma.Decimal(0);
  return { withheld, netPayable: baseAmount.minus(withheld) };
}

export function listTaxPeriods(organizationId: string) {
  return db.accountingTaxPeriod.findMany({ where: { organizationId }, orderBy: { startDate: "desc" } });
}

export async function createTaxPeriod(organizationId: string, data: { name: string; startDate: Date; endDate: Date; filingDueDate: Date; jurisdiction: string }) {
  if (data.endDate < data.startDate) throw new TaxConfigurationError("Period end must be on or after its start.");
  if (data.filingDueDate < data.endDate) throw new TaxConfigurationError("Filing due date cannot precede the period end.");
  return db.accountingTaxPeriod.create({ data: { organizationId, ...data, jurisdiction: data.jurisdiction.trim().toUpperCase(), name: data.name.trim() } });
}

export async function getTaxReturnWorkingReport(organizationId: string, periodId?: string | null) {
  const period = periodId ? await db.accountingTaxPeriod.findFirst({ where: { id: periodId, organizationId } }) : await db.accountingTaxPeriod.findFirst({ where: { organizationId }, orderBy: { startDate: "desc" } });
  if (!period) return { period: null, transactions: [], output: emptyTotals(), input: emptyTotals(), net: emptyTotals() };
  const transactions = await db.accountingTaxTransaction.findMany({ where: { organizationId, transactionDate: { gte: period.startDate, lte: period.endDate } }, include: { taxCode: true }, orderBy: [{ transactionDate: "asc" }, { createdAt: "asc" }] });
  const output = sumTransactions(transactions.filter((transaction) => transaction.direction === "OUTPUT" || transaction.direction === "ADJUSTMENT"));
  const input = sumTransactions(transactions.filter((transaction) => transaction.direction === "INPUT"));
  return { period, transactions, output, input, net: { taxableAmount: output.taxableAmount.minus(input.taxableAmount), vatAmount: output.vatAmount.minus(input.vatAmount), nhilAmount: output.nhilAmount.minus(input.nhilAmount), getfundAmount: output.getfundAmount.minus(input.getfundAmount), totalTax: output.totalTax.minus(input.totalTax) } };
}

function emptyTotals(): { taxableAmount: Prisma.Decimal; vatAmount: Prisma.Decimal; nhilAmount: Prisma.Decimal; getfundAmount: Prisma.Decimal; totalTax: Prisma.Decimal } {
  return { taxableAmount: new Prisma.Decimal(0), vatAmount: new Prisma.Decimal(0), nhilAmount: new Prisma.Decimal(0), getfundAmount: new Prisma.Decimal(0), totalTax: new Prisma.Decimal(0) };
}

function sumTransactions(transactions: { taxableAmount: Prisma.Decimal; vatAmount: Prisma.Decimal; nhilAmount: Prisma.Decimal; getfundAmount: Prisma.Decimal }[]): ReturnType<typeof emptyTotals> {
  return transactions.reduce<ReturnType<typeof emptyTotals>>((total, transaction) => ({ taxableAmount: total.taxableAmount.plus(transaction.taxableAmount), vatAmount: total.vatAmount.plus(transaction.vatAmount), nhilAmount: total.nhilAmount.plus(transaction.nhilAmount), getfundAmount: total.getfundAmount.plus(transaction.getfundAmount), totalTax: total.totalTax.plus(transaction.vatAmount).plus(transaction.nhilAmount).plus(transaction.getfundAmount) }), emptyTotals());
}

export async function updateTaxPeriodStatus(organizationId: string, periodId: string, action: "LOCK" | "REOPEN" | "FILE", filingReference?: string | null) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${organizationId}:tax-periods`}))`;
    const period = await tx.accountingTaxPeriod.findFirst({ where: { id: periodId, organizationId } });
    if (!period) throw new TaxPeriodStateError("Tax period not found.");
    if (action === "LOCK" && period.status !== "OPEN") throw new TaxPeriodStateError("Only open tax periods can be locked.");
    if (action === "REOPEN" && period.status !== "LOCKED") throw new TaxPeriodStateError("Only locked, unfiled periods can be reopened.");
    if (action === "FILE" && period.status !== "LOCKED") throw new TaxPeriodStateError("Lock and review the period before marking it filed.");
    if (action === "FILE" && !filingReference?.trim()) throw new TaxPeriodStateError("A GRA filing or acknowledgement reference is required.");
    return tx.accountingTaxPeriod.update({ where: { id: period.id }, data: action === "LOCK" ? { status: "LOCKED", lockedAt: new Date() } : action === "REOPEN" ? { status: "OPEN", lockedAt: null } : { status: "FILED", filedAt: new Date(), filingReference: filingReference!.trim() } });
  });
}
