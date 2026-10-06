import "server-only";

import { Prisma, type AccountingAccountType, type TaxKind } from "@prisma/client";
import { db } from "@/lib/db";
import { convertToBase } from "@/modules/globalization/fx";
import { lineFx } from "./multi-currency";

/**
 * Ledger posting for documents taxed by the tax engine (a TaxRule).
 *
 * Every tax component posts to its own mapped account, so sales tax, VAT,
 * levies, excise, and use tax never collapse into one generic tax balance.
 * The mapping comes from the rate (outputAccountCode/inputAccountCode) or a
 * default by tax kind. Amounts are converted with the document's fixed
 * exchange rate; receivable/payable totals are the exact sum of the converted
 * parts, so journals always balance.
 */

const TAX_ACCOUNT_CATALOG: Record<string, { name: string; type: AccountingAccountType }> = {
  "1300": { name: "Recoverable Input VAT", type: "ASSET" },
  "1310": { name: "Recoverable Input NHIL", type: "ASSET" },
  "1320": { name: "Recoverable Input GETFund Levy", type: "ASSET" },
  "1330": { name: "Recoverable Input Tax (Other)", type: "ASSET" },
  "2100": { name: "VAT Payable", type: "LIABILITY" },
  "2110": { name: "NHIL Payable", type: "LIABILITY" },
  "2120": { name: "GETFund Levy Payable", type: "LIABILITY" },
  "2140": { name: "Sales Tax Payable", type: "LIABILITY" },
  "2145": { name: "Use Tax Payable", type: "LIABILITY" },
  "2150": { name: "Other Taxes and Levies Payable", type: "LIABILITY" },
  "2160": { name: "Excise Tax Payable", type: "LIABILITY" },
};

export function defaultOutputAccountCode(kind: TaxKind): string {
  if (kind === "VAT" || kind === "GST") return "2100";
  if (kind === "SALES") return "2140";
  if (kind === "USE") return "2145";
  if (kind === "EXCISE") return "2160";
  return "2150";
}

export function defaultInputAccountCode(kind: TaxKind): string {
  return kind === "VAT" || kind === "GST" ? "1300" : "1330";
}

/** Resolves account ids by code, creating catalog tax accounts on first use. */
export async function ensureTaxAccounts(organizationId: string, codes: string[]) {
  const unique = [...new Set(codes)];
  const known = unique.filter((code) => TAX_ACCOUNT_CATALOG[code]);
  if (known.length) {
    await db.accountingAccount.createMany({ data: known.map((code) => ({ organizationId, code, ...TAX_ACCOUNT_CATALOG[code], isSystem: true })), skipDuplicates: true });
  }
  const accounts = await db.accountingAccount.findMany({ where: { organizationId, code: { in: unique } }, select: { id: true, code: true } });
  const byCode = new Map(accounts.map((account) => [account.code, account.id]));
  const missing = unique.filter((code) => !byCode.has(code));
  if (missing.length) throw new Error(`Tax account ${missing.join(", ")} does not exist in the chart of accounts.`);
  return byCode;
}

export type StoredTaxLine = {
  code: string;
  name: string;
  taxKind: TaxKind;
  jurisdictionCode: string;
  jurisdictionLevel: string | null;
  authorityName: string | null;
  rate: Prisma.Decimal;
  recoverable: boolean;
  treatment: string;
  taxableAmount: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  selfAssessedAmount: Prisma.Decimal;
  outputAccountCode: string | null;
  inputAccountCode: string | null;
};

type Fx = { currency: string; isForeign: boolean; rate: Prisma.Decimal.Value };

function toBase(value: Prisma.Decimal.Value, fx: Fx) {
  return fx.isForeign ? convertToBase(value, fx.rate) : new Prisma.Decimal(value).toDecimalPlaces(2);
}

export function outputAccountFor(line: StoredTaxLine) {
  return line.outputAccountCode ?? defaultOutputAccountCode(line.taxKind);
}

export function inputAccountFor(line: StoredTaxLine) {
  return line.inputAccountCode ?? defaultInputAccountCode(line.taxKind);
}

/** Account codes a document's posting needs, for ensureTaxAccounts(). */
export function requiredTaxAccountCodes(lines: StoredTaxLine[], side: "SALE" | "PURCHASE") {
  return lines.flatMap((line) => {
    const codes: string[] = [];
    if (side === "SALE" && line.taxAmount.greaterThan(0)) codes.push(outputAccountFor(line));
    if (side === "PURCHASE" && (line.taxAmount.greaterThan(0) || line.selfAssessedAmount.greaterThan(0)) && line.recoverable) codes.push(inputAccountFor(line));
    if (side === "PURCHASE" && line.selfAssessedAmount.greaterThan(0)) codes.push(outputAccountFor(line));
    return codes;
  });
}

type JournalLine = { accountId: string; debit?: string; credit?: string; transactionCurrency?: string; transactionAmount?: string; exchangeRate?: string };

export type LedgerRow = {
  rateCode: string;
  taxKind: TaxKind;
  jurisdictionCode: string;
  jurisdictionLevel: string | null;
  authorityName: string | null;
  rate: Prisma.Decimal;
  treatment: string;
  taxableAmount: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  selfAssessedAmount: Prisma.Decimal;
};

/**
 * Sales document (invoice): Debit receivable, credit revenue, credit each
 * output tax account. Returns the journal lines, base-currency ledger rows,
 * and a legacy component summary (VAT/NHIL/GETFund by payable account) so the
 * existing working VAT return keeps covering engine-taxed documents.
 */
export function buildSalesPosting(input: { taxableAmount: Prisma.Decimal; amount: Prisma.Decimal; lines: StoredTaxLine[]; fx: Fx; receivableAccountId: string; revenueAccountId: string; accountIds: Map<string, string> }) {
  const taxableBase = toBase(input.taxableAmount, input.fx);
  const journal: JournalLine[] = [{ accountId: input.revenueAccountId, credit: taxableBase.toFixed(2), ...lineFx(input.fx, input.taxableAmount) }];
  const ledger: LedgerRow[] = [];
  const legacy = { vat: new Prisma.Decimal(0), nhil: new Prisma.Decimal(0), getfund: new Prisma.Decimal(0) };
  let total = taxableBase;
  for (const line of input.lines) {
    const taxBase = toBase(line.taxAmount, input.fx);
    const lineTaxable = toBase(line.taxableAmount, input.fx);
    if (taxBase.greaterThan(0)) {
      const code = outputAccountFor(line);
      journal.push({ accountId: input.accountIds.get(code)!, credit: taxBase.toFixed(2), ...lineFx(input.fx, line.taxAmount) });
      total = total.plus(taxBase);
      if (code === "2110") legacy.nhil = legacy.nhil.plus(taxBase);
      else if (code === "2120") legacy.getfund = legacy.getfund.plus(taxBase);
      else if (code === "2100") legacy.vat = legacy.vat.plus(taxBase);
    }
    ledger.push({ rateCode: line.code, taxKind: line.taxKind, jurisdictionCode: line.jurisdictionCode, jurisdictionLevel: line.jurisdictionLevel, authorityName: line.authorityName, rate: line.rate, treatment: line.treatment, taxableAmount: lineTaxable, taxAmount: taxBase, selfAssessedAmount: toBase(line.selfAssessedAmount, input.fx) });
  }
  journal.unshift({ accountId: input.receivableAccountId, debit: total.toFixed(2), ...lineFx(input.fx, input.amount) });
  return { journal, ledger, total, taxableBase, legacy };
}

/**
 * Purchase document (bill): Debit expense, debit recoverable input tax (or
 * expense for non-recoverable tax), credit payable. Self-assessed tax
 * (reverse charge, use tax) debits input tax or expense and credits the
 * output/use tax payable account; it is not owed to the supplier.
 */
export function buildPurchasePosting(input: { taxableAmount: Prisma.Decimal; amount: Prisma.Decimal; lines: StoredTaxLine[]; fx: Fx; expenseAccountId: string; payableAccountId: string; accountIds: Map<string, string> }) {
  const taxableBase = toBase(input.taxableAmount, input.fx);
  let expense = taxableBase;
  let payable = taxableBase;
  const journal: JournalLine[] = [];
  const ledger: LedgerRow[] = [];
  const legacy = { vat: new Prisma.Decimal(0), nhil: new Prisma.Decimal(0), getfund: new Prisma.Decimal(0) };
  for (const line of input.lines) {
    const taxBase = toBase(line.taxAmount, input.fx);
    const selfBase = toBase(line.selfAssessedAmount, input.fx);
    if (taxBase.greaterThan(0)) {
      payable = payable.plus(taxBase);
      if (line.recoverable) {
        const code = inputAccountFor(line);
        journal.push({ accountId: input.accountIds.get(code)!, debit: taxBase.toFixed(2), ...lineFx(input.fx, line.taxAmount) });
        if (code === "1310") legacy.nhil = legacy.nhil.plus(taxBase);
        else if (code === "1320") legacy.getfund = legacy.getfund.plus(taxBase);
        else if (code === "1300") legacy.vat = legacy.vat.plus(taxBase);
      } else {
        expense = expense.plus(taxBase);
      }
    }
    if (selfBase.greaterThan(0)) {
      if (line.recoverable) journal.push({ accountId: input.accountIds.get(inputAccountFor(line))!, debit: selfBase.toFixed(2) });
      else expense = expense.plus(selfBase);
      journal.push({ accountId: input.accountIds.get(outputAccountFor(line))!, credit: selfBase.toFixed(2) });
    }
    ledger.push({ rateCode: line.code, taxKind: line.taxKind, jurisdictionCode: line.jurisdictionCode, jurisdictionLevel: line.jurisdictionLevel, authorityName: line.authorityName, rate: line.rate, treatment: line.treatment, taxableAmount: toBase(line.taxableAmount, input.fx), taxAmount: taxBase, selfAssessedAmount: selfBase });
  }
  journal.unshift({ accountId: input.expenseAccountId, debit: expense.toFixed(2), ...lineFx(input.fx, input.taxableAmount) });
  journal.push({ accountId: input.payableAccountId, credit: payable.toFixed(2), ...lineFx(input.fx, input.amount) });
  return { journal, ledger, total: payable, taxableBase, legacy };
}

/** Swaps debits and credits (for voids), keeping original-currency metadata. */
export function reverseJournal(lines: JournalLine[]): JournalLine[] {
  return lines.map(({ debit, credit, ...rest }) => (debit ? { ...rest, credit: debit } : { ...rest, debit: credit }));
}

/** Base-currency document total for a new engine-taxed document. */
export function engineBaseTotal(taxableAmount: Prisma.Decimal.Value, taxAmounts: Prisma.Decimal.Value[], fx: Fx) {
  return taxAmounts.reduce<Prisma.Decimal>((sum, tax) => sum.plus(toBase(tax, fx)), toBase(taxableAmount, fx));
}
