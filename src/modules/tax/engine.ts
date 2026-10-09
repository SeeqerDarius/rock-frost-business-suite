import { Prisma } from "@prisma/client";

/**
 * Pure, jurisdiction-agnostic tax calculation. No country logic lives here:
 * jurisdiction packs and tenant configuration decide WHICH components apply
 * (rules, registrations, exemptions); this engine only computes amounts from
 * the components it is given, with exact decimals.
 *
 * - Simple components apply to the taxable base.
 * - Compound components apply to the base plus all simple component taxes.
 * - Exclusive pricing adds tax to the entered amount; inclusive pricing
 *   back-calculates the taxable base from a gross amount. In inclusive mode
 *   the last component absorbs any cent of rounding so taxable + taxes always
 *   equals the gross exactly (the invariant a balanced journal needs).
 * - Exempt, zero-rated, out-of-scope, and reverse-charge treatments produce
 *   explicit zero-amount component lines so reports can still show taxable,
 *   exempt, and zero-rated sales separately. Reverse charge additionally
 *   returns the self-assessed amount the buyer must account for.
 */
export class TaxCalculationError extends Error {}

export type TaxTreatment = "STANDARD" | "REDUCED" | "ZERO_RATED" | "EXEMPT" | "REVERSE_CHARGE" | "OUT_OF_SCOPE";

export type TaxComponentInput = {
  rateId?: string | null;
  code: string;
  name: string;
  taxType: string;
  jurisdictionCode: string;
  jurisdictionLevel?: string | null;
  authorityName?: string | null;
  /** Percentage, e.g. "15" for 15%. */
  rate: Prisma.Decimal.Value;
  compound?: boolean;
  recoverable?: boolean;
  sortOrder?: number;
};

export type TaxLine = {
  rateId: string | null;
  code: string;
  name: string;
  taxType: string;
  jurisdictionCode: string;
  jurisdictionLevel: string | null;
  authorityName: string | null;
  rate: Prisma.Decimal;
  compound: boolean;
  recoverable: boolean;
  taxableAmount: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  /** Self-assessed tax under reverse charge (the supplier charges zero). */
  selfAssessedAmount: Prisma.Decimal;
  sortOrder: number;
};

export type TaxCalculation = {
  treatment: TaxTreatment;
  pricesIncludeTax: boolean;
  taxableAmount: Prisma.Decimal;
  totalTax: Prisma.Decimal;
  grossAmount: Prisma.Decimal;
  lines: TaxLine[];
  reverseCharge: boolean;
  totalSelfAssessed: Prisma.Decimal;
};

const ZERO = new Prisma.Decimal(0);
const HUNDRED = new Prisma.Decimal(100);

function round(value: Prisma.Decimal) {
  return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

function validateRate(component: TaxComponentInput): Prisma.Decimal {
  let rate: Prisma.Decimal;
  try {
    rate = new Prisma.Decimal(component.rate);
  } catch {
    throw new TaxCalculationError(`Tax rate for ${component.code} is not a number.`);
  }
  if (!rate.isFinite() || rate.isNegative() || rate.greaterThan(HUNDRED)) throw new TaxCalculationError(`Tax rate for ${component.code} must be between 0 and 100 percent.`);
  return rate;
}

function toLine(component: TaxComponentInput, rate: Prisma.Decimal, taxableAmount: Prisma.Decimal, taxAmount: Prisma.Decimal, selfAssessedAmount = ZERO, index = 0): TaxLine {
  return {
    rateId: component.rateId ?? null,
    code: component.code,
    name: component.name,
    taxType: component.taxType,
    jurisdictionCode: component.jurisdictionCode,
    jurisdictionLevel: component.jurisdictionLevel ?? null,
    authorityName: component.authorityName ?? null,
    rate,
    compound: component.compound ?? false,
    recoverable: component.recoverable ?? true,
    taxableAmount,
    taxAmount,
    selfAssessedAmount,
    sortOrder: component.sortOrder ?? index,
  };
}

export function calculateTaxes(input: {
  amount: Prisma.Decimal.Value;
  components: TaxComponentInput[];
  treatment?: TaxTreatment;
  pricesIncludeTax?: boolean;
}): TaxCalculation {
  const amount = new Prisma.Decimal(input.amount);
  if (!amount.isFinite() || amount.isNegative()) throw new TaxCalculationError("Amount must be zero or greater.");
  const treatment = input.treatment ?? "STANDARD";
  const pricesIncludeTax = input.pricesIncludeTax ?? false;
  const components = input.components.map((component, index) => ({ component, rate: validateRate(component), index }));
  const amountRounded = round(amount);

  // Treatments that charge no tax still record zero lines for reporting.
  if (treatment === "EXEMPT" || treatment === "ZERO_RATED" || treatment === "OUT_OF_SCOPE" || treatment === "REVERSE_CHARGE") {
    const reverseCharge = treatment === "REVERSE_CHARGE";
    const lines = components.map(({ component, rate, index }) => {
      // Under reverse charge the buyer self-assesses tax on the net amount.
      const selfAssessed = reverseCharge ? round(amountRounded.mul(rate).div(HUNDRED)) : ZERO;
      return toLine(component, treatment === "ZERO_RATED" ? ZERO : rate, amountRounded, ZERO, selfAssessed, index);
    });
    return {
      treatment,
      pricesIncludeTax,
      taxableAmount: amountRounded,
      totalTax: ZERO,
      grossAmount: amountRounded,
      lines,
      reverseCharge,
      totalSelfAssessed: lines.reduce((sum, line) => sum.plus(line.selfAssessedAmount), ZERO),
    };
  }

  const simple = components.filter(({ component }) => !component.compound);
  const compound = components.filter(({ component }) => component.compound);
  const simpleRate = simple.reduce((sum, { rate }) => sum.plus(rate), ZERO).div(HUNDRED);
  const compoundRate = compound.reduce((sum, { rate }) => sum.plus(rate), ZERO).div(HUNDRED);

  const taxableAmount = pricesIncludeTax
    ? round(amountRounded.div(simpleRate.plus(1).mul(compoundRate.plus(1))))
    : amountRounded;

  const lines: TaxLine[] = [];
  let simpleTotal = ZERO;
  for (const { component, rate, index } of simple) {
    const tax = round(taxableAmount.mul(rate).div(HUNDRED));
    simpleTotal = simpleTotal.plus(tax);
    lines.push(toLine(component, rate, taxableAmount, tax, ZERO, index));
  }
  const compoundBase = taxableAmount.plus(simpleTotal);
  for (const { component, rate, index } of compound) {
    lines.push(toLine(component, rate, compoundBase, round(compoundBase.mul(rate).div(HUNDRED)), ZERO, index));
  }

  let totalTax = lines.reduce((sum, line) => sum.plus(line.taxAmount), ZERO);
  if (pricesIncludeTax && lines.length > 0) {
    const residue = amountRounded.minus(taxableAmount).minus(totalTax);
    if (!residue.isZero()) {
      const last = lines[lines.length - 1];
      last.taxAmount = last.taxAmount.plus(residue);
      totalTax = totalTax.plus(residue);
    }
  }
  lines.sort((a, b) => a.sortOrder - b.sortOrder);
  return {
    treatment,
    pricesIncludeTax,
    taxableAmount,
    totalTax,
    grossAmount: taxableAmount.plus(totalTax),
    lines,
    reverseCharge: false,
    totalSelfAssessed: ZERO,
  };
}

/** Sums several calculations (e.g. one per document line with different categories). */
export function combineCalculations(calculations: TaxCalculation[]) {
  const byCode = new Map<string, TaxLine>();
  for (const calculation of calculations) {
    for (const line of calculation.lines) {
      const key = `${line.code}|${line.rate.toString()}|${line.jurisdictionCode}`;
      const existing = byCode.get(key);
      if (existing) {
        existing.taxableAmount = existing.taxableAmount.plus(line.taxableAmount);
        existing.taxAmount = existing.taxAmount.plus(line.taxAmount);
        existing.selfAssessedAmount = existing.selfAssessedAmount.plus(line.selfAssessedAmount);
      } else {
        byCode.set(key, { ...line });
      }
    }
  }
  const lines = [...byCode.values()].sort((a, b) => a.sortOrder - b.sortOrder);
  return {
    taxableAmount: calculations.reduce((sum, c) => sum.plus(c.taxableAmount), ZERO),
    totalTax: calculations.reduce((sum, c) => sum.plus(c.totalTax), ZERO),
    grossAmount: calculations.reduce((sum, c) => sum.plus(c.grossAmount), ZERO),
    totalSelfAssessed: calculations.reduce((sum, c) => sum.plus(c.totalSelfAssessed), ZERO),
    lines,
  };
}
