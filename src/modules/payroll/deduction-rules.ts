import "server-only";

import { Prisma, type PayrollDeductionKind, type PayrollDeductionMethod, type PayrollDeductionMode } from "@prisma/client";
import { db } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit";
import { US_FEDERAL_ACCOUNTS } from "@/modules/tax/packs/united-states";
import { assertRuleComplete, PayrollDeductionError, type Bracket, type DeductionRuleInput } from "./statutory";

/**
 * Tenant configuration for payroll statutory deductions. Rules belong to one
 * tax year and are used by a run only once an administrator has confirmed
 * their figures. Templates create unconfirmed rules carrying only figures
 * fixed in statute; yearly figures (such as a social security wage base or
 * withholding brackets) are left for the administrator to enter from the
 * authority's current publication.
 */

export { PayrollDeductionError } from "./statutory";

export const FILING_STATUSES = [
  { value: "SINGLE", label: "Single or married filing separately" },
  { value: "MARRIED_JOINTLY", label: "Married filing jointly" },
  { value: "HEAD_OF_HOUSEHOLD", label: "Head of household" },
] as const;

export type RuleWriteInput = {
  code: string;
  name: string;
  kind: PayrollDeductionKind;
  method: PayrollDeductionMethod;
  taxYear: number;
  rate?: string | null;
  brackets?: Bracket[] | null;
  annualAllowance?: string | null;
  wageBase?: string | null;
  wageFloor?: string | null;
  filingStatus?: string | null;
  liabilityAccountCode: string;
  expenseAccountCode?: string | null;
  sourceReference?: string | null;
  sortOrder?: number;
};

const decimalOrNull = (value: string | null | undefined, label: string, options: { positive?: boolean; max?: number } = {}) => {
  if (value === null || value === undefined || value.trim() === "") return null;
  let parsed: Prisma.Decimal;
  try {
    parsed = new Prisma.Decimal(value.replace(/,/g, "").trim());
  } catch {
    throw new PayrollDeductionError(`${label} must be a number.`);
  }
  if (!parsed.isFinite() || parsed.isNegative() || (options.positive && parsed.isZero())) throw new PayrollDeductionError(`${label} must be ${options.positive ? "greater than zero" : "zero or more"}.`);
  if (options.max !== undefined && parsed.greaterThan(options.max)) throw new PayrollDeductionError(`${label} must be at most ${options.max}.`);
  return parsed;
};

function normalize(input: RuleWriteInput) {
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{1,39}$/.test(code)) throw new PayrollDeductionError("Use a code of 2 to 40 letters, numbers, dashes, or underscores.");
  const name = input.name.trim();
  if (name.length < 2 || name.length > 120) throw new PayrollDeductionError("Enter a name of 2 to 120 characters.");
  if (!Number.isInteger(input.taxYear) || input.taxYear < 2000 || input.taxYear > 2100) throw new PayrollDeductionError("Enter a valid tax year.");
  if (input.kind !== "EMPLOYER_CONTRIBUTION" && input.expenseAccountCode) throw new PayrollDeductionError("Only employer contributions have an expense account.");
  return {
    code, name, kind: input.kind, method: input.method, taxYear: input.taxYear,
    rate: input.method === "PERCENTAGE" ? decimalOrNull(input.rate, "Rate", { max: 100 }) : null,
    brackets: input.method === "BRACKETS" && input.brackets?.length ? (input.brackets as Prisma.InputJsonValue) : Prisma.DbNull,
    annualAllowance: input.method === "BRACKETS" ? decimalOrNull(input.annualAllowance, "Annual allowance") : null,
    wageBase: input.method === "PERCENTAGE" ? decimalOrNull(input.wageBase, "Annual wage base", { positive: true }) : null,
    wageFloor: input.method === "PERCENTAGE" ? decimalOrNull(input.wageFloor, "Annual wage threshold") : null,
    filingStatus: input.filingStatus?.trim() || null,
    liabilityAccountCode: input.liabilityAccountCode.trim(),
    expenseAccountCode: input.kind === "EMPLOYER_CONTRIBUTION" ? input.expenseAccountCode?.trim() || null : null,
    sourceReference: input.sourceReference?.trim().slice(0, 500) || null,
    sortOrder: input.sortOrder ?? 0,
    effectiveFrom: new Date(Date.UTC(input.taxYear, 0, 1)),
    effectiveTo: new Date(Date.UTC(input.taxYear, 11, 31)),
  };
}

async function assertAccounts(organizationId: string, rule: { liabilityAccountCode: string; expenseAccountCode: string | null }) {
  const accounts = await db.accountingAccount.findMany({ where: { organizationId, code: { in: [rule.liabilityAccountCode, ...(rule.expenseAccountCode ? [rule.expenseAccountCode] : [])] } }, select: { code: true, type: true } });
  const liability = accounts.find((account) => account.code === rule.liabilityAccountCode);
  if (!liability || liability.type !== "LIABILITY") throw new PayrollDeductionError(`Account ${rule.liabilityAccountCode} must be a liability account in your chart of accounts.`);
  if (rule.expenseAccountCode) {
    const expense = accounts.find((account) => account.code === rule.expenseAccountCode);
    if (!expense || expense.type !== "EXPENSE") throw new PayrollDeductionError(`Account ${rule.expenseAccountCode} must be an expense account in your chart of accounts.`);
  }
}

export function listDeductionRules(organizationId: string, taxYear?: number) {
  return db.payrollDeductionRule.findMany({ where: { organizationId, ...(taxYear ? { taxYear } : {}) }, orderBy: [{ taxYear: "desc" }, { sortOrder: "asc" }, { code: "asc" }] });
}

export async function createDeductionRule(organizationId: string, actorId: string, input: RuleWriteInput) {
  const data = normalize(input);
  await assertAccounts(organizationId, data);
  const existing = await db.payrollDeductionRule.findFirst({ where: { organizationId, code: data.code, taxYear: data.taxYear }, select: { id: true } });
  if (existing) throw new PayrollDeductionError(`A rule with code ${data.code} already exists for ${data.taxYear}.`);
  const created = await db.payrollDeductionRule.create({ data: { organizationId, ...data } });
  await logAuditEvent({ organizationId, userId: actorId, module: "payroll", action: "payroll_deduction_rule.created", entityName: "PayrollDeductionRule", entityId: created.id, metadata: { code: data.code, taxYear: data.taxYear } });
  return created;
}

/** Updates a rule's figures. Any change clears its confirmation, so it must be confirmed again before a run uses it. */
export async function updateDeductionRule(organizationId: string, actorId: string, ruleId: string, input: RuleWriteInput) {
  const rule = await db.payrollDeductionRule.findFirst({ where: { id: ruleId, organizationId } });
  if (!rule) throw new PayrollDeductionError("Deduction rule not found.");
  const data = normalize({ ...input, code: rule.code, taxYear: rule.taxYear });
  await assertAccounts(organizationId, data);
  const updated = await db.payrollDeductionRule.update({ where: { id: rule.id }, data: { ...data, confirmedAt: null, confirmedById: null } });
  await logAuditEvent({ organizationId, userId: actorId, module: "payroll", action: "payroll_deduction_rule.updated", entityName: "PayrollDeductionRule", entityId: rule.id, metadata: { code: rule.code, taxYear: rule.taxYear, previouslyConfirmed: !!rule.confirmedAt } });
  return updated;
}

/** Template rules that need a yearly figure the template cannot supply. */
const REQUIRED_WAGE_BASE = new Set(["US_SS_EE", "US_SS_ER", "US_FUTA"]);

export function ruleInput(rule: { id: string; code: string; name: string; kind: PayrollDeductionKind; method: PayrollDeductionMethod; rate: Prisma.Decimal | null; brackets: Prisma.JsonValue | null; annualAllowance: Prisma.Decimal | null; wageBase: Prisma.Decimal | null; wageFloor: Prisma.Decimal | null; filingStatus: string | null; liabilityAccountCode: string; expenseAccountCode: string | null; sortOrder: number }): DeductionRuleInput {
  return { ...rule, brackets: (rule.brackets as Bracket[] | null) ?? null };
}

export async function confirmDeductionRule(organizationId: string, actorId: string, ruleId: string, attested: boolean) {
  if (!attested) throw new PayrollDeductionError("Confirm that you checked these figures against the current official publication.");
  const rule = await db.payrollDeductionRule.findFirst({ where: { id: ruleId, organizationId } });
  if (!rule) throw new PayrollDeductionError("Deduction rule not found.");
  assertRuleComplete(ruleInput(rule));
  if (rule.templateKey && REQUIRED_WAGE_BASE.has(rule.templateKey) && !rule.wageBase) throw new PayrollDeductionError(`${rule.name}: enter the annual wage base for ${rule.taxYear}.`);
  await assertAccounts(organizationId, rule);
  const confirmed = await db.payrollDeductionRule.update({ where: { id: rule.id }, data: { confirmedAt: new Date(), confirmedById: actorId } });
  await logAuditEvent({ organizationId, userId: actorId, module: "payroll", action: "payroll_deduction_rule.confirmed", entityName: "PayrollDeductionRule", entityId: rule.id, metadata: { code: rule.code, taxYear: rule.taxYear, rate: rule.rate?.toString() ?? null, wageBase: rule.wageBase?.toString() ?? null, wageFloor: rule.wageFloor?.toString() ?? null, brackets: rule.brackets ?? null, annualAllowance: rule.annualAllowance?.toString() ?? null } });
  return confirmed;
}

export async function setDeductionRuleActive(organizationId: string, actorId: string, ruleId: string, active: boolean) {
  const updated = await db.payrollDeductionRule.updateMany({ where: { id: ruleId, organizationId }, data: { active } });
  if (updated.count === 0) throw new PayrollDeductionError("Deduction rule not found.");
  await logAuditEvent({ organizationId, userId: actorId, module: "payroll", action: active ? "payroll_deduction_rule.activated" : "payroll_deduction_rule.deactivated", entityName: "PayrollDeductionRule", entityId: ruleId });
}

export async function setDeductionMode(organizationId: string, actorId: string, mode: PayrollDeductionMode) {
  const settings = await db.payrollSettings.upsert({ where: { organizationId }, update: { deductionMode: mode }, create: { organizationId, deductionMode: mode } });
  await logAuditEvent({ organizationId, userId: actorId, module: "payroll", action: "payroll_settings.deduction_mode_changed", entityName: "PayrollSettings", entityId: settings.id, metadata: { mode } });
  return settings;
}

/**
 * Rules a run uses: active rules for the pay date's tax year in effect on the
 * pay date. Every one must be confirmed; an unconfirmed active rule stops
 * the run rather than being skipped silently.
 */
export async function rulesForPayDate(organizationId: string, payDate: Date, client: Pick<typeof db, "payrollDeductionRule"> = db) {
  const taxYear = payDate.getUTCFullYear();
  const day = new Date(Date.UTC(payDate.getUTCFullYear(), payDate.getUTCMonth(), payDate.getUTCDate()));
  const rules = await client.payrollDeductionRule.findMany({
    where: { organizationId, taxYear, active: true, effectiveFrom: { lte: day }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: day } }] },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
  });
  if (rules.length === 0) throw new PayrollDeductionError(`No active deduction rules are set up for ${taxYear}. Add or confirm rules in Payroll, Deductions, or switch back to the flat rate.`);
  const unconfirmed = rules.filter((rule) => !rule.confirmedAt);
  if (unconfirmed.length) throw new PayrollDeductionError(`Confirm these ${taxYear} deduction rules before running payroll: ${unconfirmed.map((rule) => rule.code).join(", ")}.`);
  return { taxYear, rules };
}

// --- US federal template ----------------------------------------------------

type TemplateRule = Omit<RuleWriteInput, "taxYear"> & { templateKey: string };

const IRS_15T = "IRS Publication 15-T, percentage method tables for automated payroll systems, for the tax year";

/**
 * Federal payroll taxes only. Rates fixed in the Internal Revenue Code are
 * prefilled; the yearly Social Security wage base, the withholding brackets
 * and standard allowance for each filing status, and the employer's state
 * unemployment rate and wage base must be entered by the administrator.
 */
export const US_FEDERAL_TEMPLATE: TemplateRule[] = [
  { templateKey: "US_FIT_SINGLE", code: "US-FIT-SINGLE", name: "Federal income tax withholding (single or married filing separately)", kind: "EMPLOYEE_WITHHOLDING", method: "BRACKETS", filingStatus: "SINGLE", liabilityAccountCode: "2210", sourceReference: IRS_15T, sortOrder: 10 },
  { templateKey: "US_FIT_MFJ", code: "US-FIT-MFJ", name: "Federal income tax withholding (married filing jointly)", kind: "EMPLOYEE_WITHHOLDING", method: "BRACKETS", filingStatus: "MARRIED_JOINTLY", liabilityAccountCode: "2210", sourceReference: IRS_15T, sortOrder: 11 },
  { templateKey: "US_FIT_HOH", code: "US-FIT-HOH", name: "Federal income tax withholding (head of household)", kind: "EMPLOYEE_WITHHOLDING", method: "BRACKETS", filingStatus: "HEAD_OF_HOUSEHOLD", liabilityAccountCode: "2210", sourceReference: IRS_15T, sortOrder: 12 },
  { templateKey: "US_SS_EE", code: "US-SS-EE", name: "Social Security (employee)", kind: "EMPLOYEE_CONTRIBUTION", method: "PERCENTAGE", rate: "6.2", liabilityAccountCode: "2211", sourceReference: "26 U.S.C. 3101(a). Enter the Social Security contribution and benefit base announced by the Social Security Administration for the year.", sortOrder: 20 },
  { templateKey: "US_MED_EE", code: "US-MED-EE", name: "Medicare (employee)", kind: "EMPLOYEE_CONTRIBUTION", method: "PERCENTAGE", rate: "1.45", liabilityAccountCode: "2213", sourceReference: "26 U.S.C. 3101(b)(1).", sortOrder: 21 },
  { templateKey: "US_MED_ADD_EE", code: "US-MED-ADD-EE", name: "Additional Medicare (employee, wages above $200,000)", kind: "EMPLOYEE_CONTRIBUTION", method: "PERCENTAGE", rate: "0.9", wageFloor: "200000", liabilityAccountCode: "2213", sourceReference: "26 U.S.C. 3101(b)(2) and 3102(f): withheld on wages above $200,000 paid in a calendar year, regardless of filing status.", sortOrder: 22 },
  { templateKey: "US_SS_ER", code: "US-SS-ER", name: "Social Security (employer)", kind: "EMPLOYER_CONTRIBUTION", method: "PERCENTAGE", rate: "6.2", liabilityAccountCode: "2212", expenseAccountCode: "6100", sourceReference: "26 U.S.C. 3111(a). Same annual wage base as the employee share.", sortOrder: 30 },
  { templateKey: "US_MED_ER", code: "US-MED-ER", name: "Medicare (employer)", kind: "EMPLOYER_CONTRIBUTION", method: "PERCENTAGE", rate: "1.45", liabilityAccountCode: "2214", expenseAccountCode: "6100", sourceReference: "26 U.S.C. 3111(b).", sortOrder: 31 },
  { templateKey: "US_FUTA", code: "US-FUTA", name: "Federal unemployment (FUTA)", kind: "EMPLOYER_CONTRIBUTION", method: "PERCENTAGE", rate: "0.6", wageBase: "7000", liabilityAccountCode: "2215", expenseAccountCode: "6100", sourceReference: "26 U.S.C. 3301 and 3306(b)(1): 6.0% on the first $7,000 per employee, less the credit for state unemployment tax (up to 5.4%). Employers in a credit reduction state pay more; check Form 940 Schedule A for the year.", sortOrder: 32 },
  { templateKey: "US_SUTA", code: "US-SUTA", name: "State unemployment (employer)", kind: "EMPLOYER_CONTRIBUTION", method: "PERCENTAGE", liabilityAccountCode: "2216", expenseAccountCode: "6100", sourceReference: "Your state unemployment agency's rate notice for the year (rate and taxable wage base).", sortOrder: 33 },
];

/** Creates the US federal template's rules for a tax year, unconfirmed, and the ledger accounts they post to. Idempotent. */
export async function applyUsFederalTemplate(organizationId: string, actorId: string, taxYear: number) {
  if (!Number.isInteger(taxYear) || taxYear < 2020 || taxYear > 2100) throw new PayrollDeductionError("Enter a valid tax year.");
  const codes = new Set(US_FEDERAL_TEMPLATE.flatMap((rule) => [rule.liabilityAccountCode, ...(rule.expenseAccountCode ? [rule.expenseAccountCode] : [])]));
  const accounts = US_FEDERAL_ACCOUNTS.filter((account) => codes.has(account.code));
  return db.$transaction(async (tx) => {
    const createdAccounts = await tx.accountingAccount.createMany({ data: accounts.map((account) => ({ organizationId, code: account.code, name: account.name, type: account.type })), skipDuplicates: true });
    const existing = await tx.payrollDeductionRule.findMany({ where: { organizationId, taxYear, code: { in: US_FEDERAL_TEMPLATE.map((rule) => rule.code) } }, select: { code: true } });
    const have = new Set(existing.map((rule) => rule.code));
    const toCreate = US_FEDERAL_TEMPLATE.filter((rule) => !have.has(rule.code));
    for (const template of toCreate) {
      const { templateKey, ...input } = template;
      await tx.payrollDeductionRule.create({ data: { organizationId, templateKey, ...normalize({ ...input, taxYear }) } });
    }
    await logAuditEvent({ organizationId, userId: actorId, module: "payroll", action: "payroll_deduction_template.applied", entityName: "PayrollDeductionRule", metadata: { template: "US_FEDERAL", taxYear, rulesCreated: toCreate.length, accountsCreated: createdAccounts.count } }, tx);
    return { rulesCreated: toCreate.length, accountsCreated: createdAccounts.count };
  });
}
