import { Prisma } from "@prisma/client";

/**
 * Pure, jurisdiction-agnostic payroll deduction calculation. Rules come from
 * tenant configuration (PayrollDeductionRule, entered or confirmed by an
 * administrator for each tax year); this module only computes amounts with
 * exact decimals. No statutory figures live here.
 *
 * - PERCENTAGE: rate % of the period's subject wages. An annual wage base caps
 *   the wages subject to the rule for the year (e.g. a social security wage
 *   base); an annual wage floor applies the rule only to year-to-date wages
 *   above it (e.g. an additional Medicare threshold). Both use year-to-date
 *   wages from earlier payslips in the same tax year.
 * - BRACKETS: the period's wages are annualized (x pay periods per year),
 *   an annual allowance is subtracted, progressive brackets are applied, and
 *   the annual tax is divided back per period (an annualized percentage
 *   method). The employee's additional withholding is added to the first
 *   withholding rule that applies.
 */

export type DeductionKind = "EMPLOYEE_WITHHOLDING" | "EMPLOYEE_CONTRIBUTION" | "EMPLOYER_CONTRIBUTION";
export type DeductionMethod = "PERCENTAGE" | "BRACKETS";
export type Bracket = { from: string; rate: string };

export type DeductionRuleInput = {
  id?: string | null;
  code: string;
  name: string;
  kind: DeductionKind;
  method: DeductionMethod;
  rate?: Prisma.Decimal.Value | null;
  brackets?: Bracket[] | null;
  annualAllowance?: Prisma.Decimal.Value | null;
  wageBase?: Prisma.Decimal.Value | null;
  wageFloor?: Prisma.Decimal.Value | null;
  filingStatus?: string | null;
  liabilityAccountCode: string;
  expenseAccountCode?: string | null;
  sortOrder?: number;
};

export type DeductionLine = {
  ruleId: string | null;
  code: string;
  name: string;
  kind: DeductionKind;
  subjectWages: Prisma.Decimal;
  amount: Prisma.Decimal;
  liabilityAccountCode: string;
  expenseAccountCode: string | null;
};

export class PayrollDeductionError extends Error {}

const ZERO = new Prisma.Decimal(0);
const HUNDRED = new Prisma.Decimal(100);
const round = (value: Prisma.Decimal) => value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
const max0 = (value: Prisma.Decimal) => (value.isNegative() ? ZERO : value);

export const PAY_PERIODS_PER_YEAR: Record<string, number> = { WEEKLY: 52, BIWEEKLY: 26, SEMIMONTHLY: 24, MONTHLY: 12 };

export function payPeriodsPerYear(payFrequency: string) {
  const periods = PAY_PERIODS_PER_YEAR[payFrequency];
  if (!periods) throw new PayrollDeductionError(`Unsupported pay frequency ${payFrequency}.`);
  return periods;
}

function toBrackets(value: unknown): { from: Prisma.Decimal; rate: Prisma.Decimal }[] {
  if (!Array.isArray(value) || value.length === 0) throw new PayrollDeductionError("Enter at least one bracket.");
  const parsed = value.map((entry, index) => {
    let from: Prisma.Decimal;
    let rate: Prisma.Decimal;
    try {
      from = new Prisma.Decimal(String((entry as Bracket).from).trim());
      rate = new Prisma.Decimal(String((entry as Bracket).rate).trim());
    } catch {
      throw new PayrollDeductionError(`Bracket ${index + 1} is not a number.`);
    }
    if (!from.isFinite() || from.isNegative()) throw new PayrollDeductionError(`Bracket ${index + 1}: the starting amount must be zero or more.`);
    if (!rate.isFinite() || rate.isNegative() || rate.greaterThan(HUNDRED)) throw new PayrollDeductionError(`Bracket ${index + 1}: the rate must be between 0 and 100.`);
    return { from, rate };
  });
  if (!parsed[0].from.isZero()) throw new PayrollDeductionError("The first bracket must start at 0.");
  for (let index = 1; index < parsed.length; index++) {
    if (!parsed[index].from.greaterThan(parsed[index - 1].from)) throw new PayrollDeductionError("Bracket starting amounts must increase.");
  }
  return parsed;
}

/** Progressive tax on an annual amount. */
export function bracketTax(annualAmount: Prisma.Decimal.Value, brackets: unknown) {
  const amount = max0(new Prisma.Decimal(annualAmount));
  const schedule = toBrackets(brackets);
  let tax = ZERO;
  schedule.forEach((bracket, index) => {
    const upper = schedule[index + 1]?.from;
    if (amount.lessThanOrEqualTo(bracket.from)) return;
    const top = upper && amount.greaterThan(upper) ? upper : amount;
    tax = tax.plus(top.minus(bracket.from).mul(bracket.rate).div(HUNDRED));
  });
  return tax;
}

/** Normalizes brackets entered as "from:rate" lines (e.g. "0:10" then "11925:12"). */
export function bracketsFromText(text: string): Bracket[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const brackets = lines.map((line, index) => {
    const match = /^([0-9][0-9,]*(?:\.[0-9]+)?)\s*[:=]\s*([0-9]+(?:\.[0-9]+)?)\s*%?$/.exec(line);
    if (!match) throw new PayrollDeductionError(`Bracket line ${index + 1} must look like "starting amount: rate", for example "0: 10".`);
    return { from: match[1].replace(/,/g, ""), rate: match[2] };
  });
  toBrackets(brackets);
  return brackets;
}

export function bracketsToText(value: unknown) {
  return Array.isArray(value) ? value.map((entry) => `${(entry as Bracket).from}: ${(entry as Bracket).rate}`).join("\n") : "";
}

/** Checks that a rule has the figures its method needs before it can be confirmed or used. */
export function assertRuleComplete(rule: DeductionRuleInput) {
  if (rule.method === "PERCENTAGE") {
    if (rule.rate === null || rule.rate === undefined || rule.rate === "") throw new PayrollDeductionError(`${rule.name}: enter the rate.`);
  } else {
    toBrackets(rule.brackets);
  }
  if (rule.kind === "EMPLOYER_CONTRIBUTION" && !rule.expenseAccountCode) throw new PayrollDeductionError(`${rule.name}: choose the expense account for the employer contribution.`);
}

export type EmployeeDeductionInput = {
  /** Gross pay for this period. */
  grossPay: Prisma.Decimal.Value;
  payFrequency: string;
  filingStatus?: string | null;
  additionalWithholding?: Prisma.Decimal.Value | null;
  /** Gross pay from earlier payslips in the same tax year. */
  ytdGross: Prisma.Decimal.Value;
  /** Subject wages already counted per rule code earlier in the tax year. */
  ytdSubjectByCode: Map<string, Prisma.Decimal>;
};

/** Applies every applicable rule to one employee's period pay. */
export function calculateEmployeeDeductions(rules: DeductionRuleInput[], input: EmployeeDeductionInput) {
  const gross = new Prisma.Decimal(input.grossPay);
  if (!gross.isFinite() || gross.isNegative()) throw new PayrollDeductionError("Gross pay must be zero or more.");
  const periods = payPeriodsPerYear(input.payFrequency);
  const ytdGross = new Prisma.Decimal(input.ytdGross);
  const applicable = [...rules]
    .filter((rule) => !rule.filingStatus || rule.filingStatus === (input.filingStatus ?? null))
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  let extraWithholding = max0(new Prisma.Decimal(input.additionalWithholding ?? 0));
  const lines: DeductionLine[] = [];
  for (const rule of applicable) {
    assertRuleComplete(rule);
    let subject = gross;
    let amount: Prisma.Decimal;
    if (rule.method === "PERCENTAGE") {
      if (rule.wageFloor !== null && rule.wageFloor !== undefined) {
        const floor = new Prisma.Decimal(rule.wageFloor);
        subject = max0(ytdGross.plus(gross).minus(floor)).minus(max0(ytdGross.minus(floor)));
      }
      if (rule.wageBase !== null && rule.wageBase !== undefined) {
        const counted = input.ytdSubjectByCode.get(rule.code) ?? ZERO;
        const remaining = max0(new Prisma.Decimal(rule.wageBase).minus(counted));
        if (subject.greaterThan(remaining)) subject = remaining;
      }
      amount = round(subject.mul(new Prisma.Decimal(rule.rate!)).div(HUNDRED));
    } else {
      const annualTaxable = max0(gross.mul(periods).minus(new Prisma.Decimal(rule.annualAllowance ?? 0)));
      amount = round(bracketTax(annualTaxable, rule.brackets).div(periods));
      if (rule.kind === "EMPLOYEE_WITHHOLDING" && extraWithholding.greaterThan(0)) {
        amount = amount.plus(extraWithholding);
        extraWithholding = ZERO;
      }
    }
    lines.push({ ruleId: rule.id ?? null, code: rule.code, name: rule.name, kind: rule.kind, subjectWages: round(subject), amount, liabilityAccountCode: rule.liabilityAccountCode, expenseAccountCode: rule.expenseAccountCode ?? null });
  }
  const sum = (kind: DeductionKind) => lines.filter((line) => line.kind === kind).reduce((total, line) => total.plus(line.amount), ZERO);
  return {
    lines,
    withholding: sum("EMPLOYEE_WITHHOLDING"),
    employeeContributions: sum("EMPLOYEE_CONTRIBUTION"),
    employerContributions: sum("EMPLOYER_CONTRIBUTION"),
    /** Additional withholding requested but with no withholding rule to carry it. */
    unappliedAdditionalWithholding: extraWithholding,
  };
}
