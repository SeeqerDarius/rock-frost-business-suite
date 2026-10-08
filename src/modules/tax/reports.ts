import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { zonedDateRange, zonedDayStart } from "@/lib/timezone";
import { getAccountBalancesAsOf } from "@/modules/accounting/service";

/**
 * Tax reports read the per-component TaxLedgerEntry evidence written when
 * documents post (engine, legacy code, and untaxed documents). All amounts
 * are in the base currency. Periods are local calendar days in the
 * organization timezone. These are working reports for review and filing
 * preparation; they are not filed returns.
 */

const ZERO = new Prisma.Decimal(0);
/** Tax kinds whose input tax is normally recoverable against output tax. */
const RECOVERABLE_KINDS = new Set(["VAT", "GST", "LEVY"]);

export type TaxReportRow = {
  key: string;
  label: string;
  level: string | null;
  taxableSales: Prisma.Decimal;
  zeroRatedSales: Prisma.Decimal;
  exemptSales: Prisma.Decimal;
  nonTaxableSales: Prisma.Decimal;
  reverseChargeSales: Prisma.Decimal;
  taxCollected: Prisma.Decimal;
  inputTax: Prisma.Decimal;
  selfAssessed: Prisma.Decimal;
  adjustments: Prisma.Decimal;
  netPayable: Prisma.Decimal;
};

function emptyRow(key: string, label: string, level: string | null): TaxReportRow {
  return { key, label, level, taxableSales: ZERO, zeroRatedSales: ZERO, exemptSales: ZERO, nonTaxableSales: ZERO, reverseChargeSales: ZERO, taxCollected: ZERO, inputTax: ZERO, selfAssessed: ZERO, adjustments: ZERO, netPayable: ZERO };
}

export type TaxReportView = "jurisdiction" | "level" | "kind" | "authority" | "period";

export async function getTaxReport(organizationId: string, input: { from: string; to: string; view: TaxReportView }) {
  const organization = await db.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { timezone: true, currency: true, jurisdictionCode: true } });
  const { start, end } = zonedDateRange(input.from, input.to, organization.timezone);
  const entries = await db.taxLedgerEntry.findMany({
    where: { organizationId, transactionDate: { gte: start, lt: end } },
    select: { direction: true, sourceType: true, sourceId: true, jurisdictionCode: true, jurisdictionLevel: true, authorityName: true, taxKind: true, treatment: true, taxableAmount: true, taxAmount: true, selfAssessedAmount: true, customerExempt: true, transactionDate: true },
    orderBy: { transactionDate: "asc" },
    take: 50_000,
  });

  const monthKey = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: organization.timezone, year: "numeric", month: "2-digit" }).format(date);
  const groupOf = (entry: (typeof entries)[number]): { key: string; label: string; level: string | null } => {
    switch (input.view) {
      case "level": return { key: entry.jurisdictionLevel ?? "UNSPECIFIED", label: entry.jurisdictionLevel ?? "Unspecified", level: entry.jurisdictionLevel };
      case "kind": return { key: entry.taxKind, label: entry.taxKind, level: null };
      case "authority": return { key: entry.authorityName ?? "UNSPECIFIED", label: entry.authorityName ?? "No authority recorded", level: null };
      case "period": { const month = monthKey(entry.transactionDate); return { key: month, label: month, level: null }; }
      default: return { key: entry.jurisdictionCode, label: entry.jurisdictionCode === "NONE" ? "No tax" : entry.jurisdictionCode, level: entry.jurisdictionLevel };
    }
  };

  const rows = new Map<string, TaxReportRow>();
  // A document's taxable amount repeats on each of its components (e.g.
  // VAT, NHIL, GETFund); count it once per document and group.
  const countedTaxable = new Set<string>();
  for (const entry of entries) {
    const group = groupOf(entry);
    const row = rows.get(group.key) ?? emptyRow(group.key, group.label, group.level);
    const taxableKey = `${group.key}|${entry.sourceType}|${entry.sourceId}|${entry.direction}`;
    // Sale-side adjustments: voided invoices and settled credit notes reduce sales.
    const isSale = entry.direction === "OUTPUT" || (entry.direction === "ADJUSTMENT" && (entry.sourceType.includes("INVOICE") || entry.sourceType.includes("CREDIT_NOTE")));
    if (isSale && !countedTaxable.has(taxableKey)) {
      countedTaxable.add(taxableKey);
      const taxable = entry.taxableAmount;
      if (entry.treatment === "ZERO_RATED") row.zeroRatedSales = row.zeroRatedSales.plus(taxable);
      else if (entry.treatment === "EXEMPT") row.exemptSales = row.exemptSales.plus(taxable);
      else if (entry.treatment === "OUT_OF_SCOPE") row.nonTaxableSales = row.nonTaxableSales.plus(taxable);
      else if (entry.treatment === "REVERSE_CHARGE") row.reverseChargeSales = row.reverseChargeSales.plus(taxable);
      else row.taxableSales = row.taxableSales.plus(taxable);
    }
    // Purchase-side adjustments (a voided bill) reverse input tax; sale-side
    // adjustments (a voided invoice) reverse output tax.
    const purchaseSide = entry.direction === "INPUT" || (entry.direction === "ADJUSTMENT" && entry.sourceType.includes("BILL"));
    if (entry.direction === "OUTPUT") row.taxCollected = row.taxCollected.plus(entry.taxAmount);
    else if (purchaseSide) {
      if (RECOVERABLE_KINDS.has(entry.taxKind)) row.inputTax = row.inputTax.plus(entry.taxAmount);
      row.selfAssessed = row.selfAssessed.plus(entry.selfAssessedAmount);
    } else {
      row.adjustments = row.adjustments.plus(entry.taxAmount);
    }
    rows.set(group.key, row);
  }
  for (const row of rows.values()) {
    // Self-assessed tax is both payable and (when recoverable) claimable as
    // input tax; recoverable self-assessment nets to zero in this view.
    row.netPayable = row.taxCollected.plus(row.adjustments).minus(row.inputTax);
  }
  const ordered = [...rows.values()].sort((a, b) => a.key.localeCompare(b.key));
  const totals = ordered.reduce((sum, row) => ({
    ...sum,
    taxableSales: sum.taxableSales.plus(row.taxableSales), zeroRatedSales: sum.zeroRatedSales.plus(row.zeroRatedSales), exemptSales: sum.exemptSales.plus(row.exemptSales),
    nonTaxableSales: sum.nonTaxableSales.plus(row.nonTaxableSales), reverseChargeSales: sum.reverseChargeSales.plus(row.reverseChargeSales), taxCollected: sum.taxCollected.plus(row.taxCollected),
    inputTax: sum.inputTax.plus(row.inputTax), selfAssessed: sum.selfAssessed.plus(row.selfAssessed), adjustments: sum.adjustments.plus(row.adjustments), netPayable: sum.netPayable.plus(row.netPayable),
  }), emptyRow("TOTAL", "Total", null));
  return { period: { from: input.from, to: input.to, start, end, timezone: organization.timezone }, baseCurrency: organization.currency, view: input.view, rows: ordered, totals, entryCount: entries.length, truncated: entries.length === 50_000 };
}

/** Customer exemption report: exempt sales by customer with certificates on file. */
export async function getExemptionReport(organizationId: string, input: { from: string; to: string }) {
  const organization = await db.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { timezone: true } });
  const { start, end } = zonedDateRange(input.from, input.to, organization.timezone);
  const entries = await db.taxLedgerEntry.findMany({
    where: { organizationId, customerExempt: true, transactionDate: { gte: start, lt: end } },
    select: { sourceType: true, sourceId: true, contactId: true, counterparty: true, documentNumber: true, taxableAmount: true, jurisdictionCode: true, direction: true },
  });
  const contactIds = [...new Set(entries.map((entry) => entry.contactId).filter((id): id is string => !!id))];
  const exemptions = contactIds.length ? await db.taxExemption.findMany({ where: { organizationId, contactId: { in: contactIds } }, include: { jurisdiction: { select: { code: true } } } }) : [];
  const byCustomer = new Map<string, { customer: string; contactId: string | null; documents: Set<string>; exemptSales: Prisma.Decimal; certificates: string[] }>();
  const counted = new Set<string>();
  for (const entry of entries) {
    const key = entry.contactId ?? `name:${entry.counterparty}`;
    const row = byCustomer.get(key) ?? { customer: entry.counterparty ?? "Unknown", contactId: entry.contactId, documents: new Set<string>(), exemptSales: ZERO, certificates: exemptions.filter((e) => e.contactId === entry.contactId).map((e) => `${e.exemptionType}${e.certificateNumber ? ` ${e.certificateNumber}` : ""}${e.jurisdiction ? ` (${e.jurisdiction.code})` : ""}`) };
    const docKey = `${entry.sourceType}|${entry.sourceId}|${entry.direction}`;
    if (!counted.has(docKey)) {
      counted.add(docKey);
      row.exemptSales = row.exemptSales.plus(entry.direction === "ADJUSTMENT" ? entry.taxableAmount : entry.taxableAmount);
      if (entry.documentNumber) row.documents.add(entry.documentNumber);
    }
    byCustomer.set(key, row);
  }
  return [...byCustomer.values()].map((row) => ({ ...row, documents: [...row.documents] })).sort((a, b) => a.customer.localeCompare(b.customer));
}

/**
 * Tax liabilities by class from ledger balances, so sales tax, VAT and
 * levies, payroll and employment taxes, income tax, excise, and withholding
 * are never shown as one tax balance.
 */
const LIABILITY_CLASSES: { key: string; label: string; codes: string[] }[] = [
  { key: "VAT", label: "VAT, GST, and levies payable", codes: ["2100", "2110", "2120"] },
  { key: "SALES", label: "Sales and use tax payable", codes: ["2140", "2145"] },
  { key: "EXCISE", label: "Excise tax payable", codes: ["2160"] },
  { key: "OTHER_LEVIES", label: "Other taxes and levies payable", codes: ["2150"] },
  { key: "WITHHOLDING", label: "Withholding tax payable", codes: ["2130"] },
  { key: "PAYROLL", label: "Payroll and employment taxes payable", codes: ["2210", "2211", "2212", "2213", "2214", "2215", "2216", "2220"] },
  { key: "INCOME", label: "Income tax payable", codes: ["2200"] },
  { key: "RECOVERABLE", label: "Recoverable input tax (asset)", codes: ["1300", "1310", "1320", "1330"] },
  { key: "ESTIMATED", label: "Estimated income tax payments (asset)", codes: ["1450"] },
];

export async function getTaxLiabilitiesByClass(organizationId: string, asOf: string) {
  const organization = await db.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { timezone: true } });
  const next = new Date(Date.UTC(Number(asOf.slice(0, 4)), Number(asOf.slice(5, 7)) - 1, Number(asOf.slice(8, 10)) + 1)).toISOString().slice(0, 10);
  const asOfInstant = new Date(zonedDayStart(next, organization.timezone).getTime() - 1);
  const balances = await getAccountBalancesAsOf(organizationId, asOfInstant);
  return LIABILITY_CLASSES.map((klass) => {
    const accounts = balances.filter((balance) => klass.codes.includes(balance.code));
    return { key: klass.key, label: klass.label, balance: accounts.reduce((sum, account) => sum + account.balance, 0), accounts: accounts.map((account) => ({ code: account.code, name: account.name, balance: account.balance })) };
  }).filter((klass) => klass.accounts.length > 0);
}

export type OssRow = { memberState: string; rate: Prisma.Decimal; taxableAmount: Prisma.Decimal; vatAmount: Prisma.Decimal; documents: number };

/**
 * OSS (One-Stop-Shop) return worksheet: B2C supplies taxed at another member
 * state's VAT rate, by member state of consumption and rate, from the tax
 * ledger in the base currency. Settled credit notes and voids appear as
 * negative amounts in the period they post; corrections to a previously
 * filed quarter must still be declared in that quarter's correction section.
 * This is a worksheet for preparing the return, not a filing file.
 */
export async function getOssReturn(organizationId: string, input: { from: string; to: string }) {
  const organization = await db.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { timezone: true, currency: true, jurisdictionCode: true } });
  const home = organization.jurisdictionCode ?? "";
  const established = /^EU-[A-Z]{2}$/.test(home);
  const { start, end } = zonedDateRange(input.from, input.to, organization.timezone);
  const entries = established
    ? await db.taxLedgerEntry.findMany({
        where: {
          organizationId, transactionDate: { gte: start, lt: end }, taxKind: "VAT", treatment: "STANDARD",
          jurisdictionCode: { startsWith: "EU-", notIn: [home, "EU-OSS", "EU-IOSS"] },
          OR: [{ direction: "OUTPUT" }, { direction: "ADJUSTMENT", sourceType: { contains: "INVOICE" } }, { direction: "ADJUSTMENT", sourceType: { contains: "CREDIT_NOTE" } }],
        },
        select: { jurisdictionCode: true, rate: true, taxableAmount: true, taxAmount: true, sourceType: true, sourceId: true, direction: true },
        take: 50_000,
      })
    : [];
  const rows = new Map<string, OssRow>();
  const counted = new Set<string>();
  for (const entry of entries) {
    const memberState = entry.jurisdictionCode.slice(3);
    const key = `${memberState}|${entry.rate.toFixed(4)}`;
    const row = rows.get(key) ?? { memberState, rate: entry.rate, taxableAmount: ZERO, vatAmount: ZERO, documents: 0 };
    const docKey = `${key}|${entry.sourceType}|${entry.sourceId}|${entry.direction}`;
    if (!counted.has(docKey)) {
      counted.add(docKey);
      row.taxableAmount = row.taxableAmount.plus(entry.taxableAmount);
      row.documents += 1;
    }
    row.vatAmount = row.vatAmount.plus(entry.taxAmount);
    rows.set(key, row);
  }
  const sorted = [...rows.values()].sort((a, b) => a.memberState.localeCompare(b.memberState) || b.rate.comparedTo(a.rate));
  const totalVat = sorted.reduce((sum, row) => sum.plus(row.vatAmount), ZERO);
  return { established, homeMemberState: established ? home.slice(3) : null, baseCurrency: organization.currency, rows: sorted, totalVat };
}
