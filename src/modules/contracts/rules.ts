/**
 * Pure Contracts rules (no database access), shared by the service layer,
 * pages, and tests.
 */

// --- Contract numbering ----------------------------------------------------

const TOKEN = /\{(PREFIX|YYYY|YY|MM|SEQ(?::(\d{1,2}))?)\}/g;

export class ContractRuleError extends Error {}

export function validateNumberFormat(format: string) {
  if (!format.includes("{SEQ")) throw new ContractRuleError("The number format must include a {SEQ} or {SEQ:n} token so numbers are unique.");
  const stripped = format.replace(TOKEN, "");
  if (/[{}]/.test(stripped)) throw new ContractRuleError("Unknown token in number format. Use {PREFIX}, {YYYY}, {YY}, {MM}, and {SEQ:n}.");
  if (format.length > 60) throw new ContractRuleError("The number format is too long.");
}

/** Formats a contract number, e.g. CTR/{YYYY}/{SEQ:6} -> CTR/2026/000001. */
export function formatContractNumber(format: string, prefix: string, date: { year: number; month: number }, sequence: number): string {
  return format.replace(TOKEN, (_match, token: string, width?: string) => {
    if (token === "PREFIX") return prefix;
    if (token === "YYYY") return String(date.year);
    if (token === "YY") return String(date.year).slice(-2);
    if (token === "MM") return String(date.month).padStart(2, "0");
    return String(sequence).padStart(Number(width ?? 1), "0");
  });
}

export function formatUsesYear(format: string) {
  return format.includes("{YYYY}") || format.includes("{YY}");
}

// --- Template variables ----------------------------------------------------

export type TemplateContext = Record<string, string | number | null | undefined>;

const VARIABLE = /\{\{\s*([a-zA-Z][a-zA-Z0-9]*(?:\.[a-zA-Z][a-zA-Z0-9]*)*)\s*\}\}/g;

/** Variables a template may use. Unknown variables are left visible so they can be fixed. */
export const TEMPLATE_VARIABLES = [
  "organization.name", "organization.legalName", "organization.address", "organization.country", "organization.registrationNumber", "organization.taxNumber",
  "counterparty.name", "counterparty.address", "counterparty.email",
  "contract.number", "contract.title", "contract.startDate", "contract.endDate", "contract.effectiveDate", "contract.value", "contract.currency",
  "contract.paymentTerms", "contract.governingLaw", "contract.noticePeriodDays",
] as const;

export function listTemplateVariables(body: string): string[] {
  return [...new Set([...body.matchAll(VARIABLE)].map((match) => match[1]))];
}

export function renderTemplate(body: string, context: TemplateContext): { text: string; missing: string[] } {
  const missing = new Set<string>();
  const text = body.replace(VARIABLE, (match, key: string) => {
    // Only the context's own keys: inherited properties such as "constructor" must never render.
    const value = Object.hasOwn(context, key) ? context[key] : undefined;
    if (value === null || value === undefined || value === "") {
      missing.add(key);
      return match;
    }
    return String(value);
  });
  return { text, missing: [...missing] };
}

// --- Confidentiality -------------------------------------------------------

export type AccessSubject = {
  userId: string;
  roleId: string | null;
  department: string | null;
  canViewConfidential: boolean;
  /** Organization policy: whether contracts.view_confidential alone opens confidential contracts. */
  confidentialAdminAccess: boolean;
};

export type AccessTarget = {
  confidentiality: "STANDARD" | "CONFIDENTIAL" | "RESTRICTED";
  ownerId: string | null;
  createdById: string | null;
  grants: { userId: string | null; roleId: string | null; department: string | null }[];
};

/**
 * Standard contracts are visible to anyone with contracts.view. Confidential
 * and restricted contracts are visible to their creator, owner, and explicit
 * grants (user, role, or department). Holding contracts.view_confidential
 * opens a confidential contract only when the organization's policy allows
 * it, and never opens a restricted one.
 */
export function canViewContract(subject: AccessSubject, target: AccessTarget): boolean {
  if (target.confidentiality === "STANDARD") return true;
  if (target.ownerId === subject.userId || target.createdById === subject.userId) return true;
  const granted = target.grants.some((grant) =>
    (grant.userId && grant.userId === subject.userId) ||
    (grant.roleId && grant.roleId === subject.roleId) ||
    (grant.department && subject.department && grant.department.toLowerCase() === subject.department.toLowerCase()));
  if (granted) return true;
  return target.confidentiality === "CONFIDENTIAL" && subject.canViewConfidential && subject.confidentialAdminAccess;
}

// --- Change tracking -------------------------------------------------------

/** Fields whose changes create a contract version. */
export const VERSIONED_FIELDS = [
  "title", "categoryId", "typeId", "branchId", "ownerId", "department", "counterpartyName", "value", "currency", "taxTreatment",
  "startDate", "effectiveDate", "expirationDate", "renewalDate", "noticePeriodDays", "renewalType", "paymentTerms", "billingFrequency",
  "governingLaw", "governingJurisdiction", "language", "status", "riskLevel", "confidentiality", "description", "body", "tags", "notes",
  "renewalTermMonths", "noticeGivenAt", "terminationEffectiveDate", "terminationReason",
] as const;
export type VersionedField = (typeof VERSIONED_FIELDS)[number];

function normalize(value: unknown): unknown {
  if (value === undefined || value === "") return null;
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object" && "toFixed" in value && typeof (value as { toFixed: unknown }).toFixed === "function") return (value as { toFixed: (n: number) => string }).toFixed(2);
  if (Array.isArray(value)) return [...value].map(String).sort();
  return value;
}

/** Field-level differences between two contract states. */
export function diffContract(before: Partial<Record<VersionedField, unknown>>, after: Partial<Record<VersionedField, unknown>>) {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const field of VERSIONED_FIELDS) {
    if (!(field in after)) continue;
    const from = normalize(before[field]);
    const to = normalize(after[field]);
    if (JSON.stringify(from) !== JSON.stringify(to)) changes[field] = { from, to };
  }
  return changes;
}

/** Values hidden from users without contracts.view_financials. */
export const FINANCIAL_FIELDS: VersionedField[] = ["value", "taxTreatment", "paymentTerms", "billingFrequency"];

export function redactFinancials<T extends Record<string, unknown>>(changes: T, canViewFinancials: boolean): T {
  if (canViewFinancials) return changes;
  const copy: Record<string, unknown> = { ...changes };
  for (const field of FINANCIAL_FIELDS) if (field in copy) copy[field] = { from: "hidden", to: "hidden" };
  return copy as T;
}

// --- Expiry ----------------------------------------------------------------

export function daysUntil(date: Date | null, now: Date = new Date()): number | null {
  if (!date) return null;
  return Math.ceil((date.getTime() - now.getTime()) / 86_400_000);
}

// --- Approval rules ---------------------------------------------------------

export const RISK_ORDER = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 } as const;
export type RiskLevel = keyof typeof RISK_ORDER;

type DecimalLike = { toString(): string } | string | number;

export type ApprovalRuleShape = {
  id: string;
  name: string;
  priority: number;
  active: boolean;
  minValue: DecimalLike | null;
  currency: string | null;
  categoryId: string | null;
  typeId: string | null;
  department: string | null;
  minRiskLevel: RiskLevel | null;
  jurisdiction: string | null;
  branchId: string | null;
};

export type ApprovalSubjectShape = {
  value: DecimalLike | null;
  currency: string;
  categoryId: string | null;
  typeId: string | null;
  department: string | null;
  riskLevel: RiskLevel;
  governingJurisdiction: string | null;
  branchId: string | null;
};

const sameText = (a: string | null, b: string | null) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/** Compares two non-negative decimal values with up to two places, without floating point. */
function decimalAtLeast(value: DecimalLike, minimum: DecimalLike) {
  const cents = (input: DecimalLike) => {
    const [whole, fraction = ""] = String(input).split(".");
    return BigInt(whole || "0") * BigInt(100) + BigInt((fraction + "00").slice(0, 2));
  };
  return cents(value) >= cents(minimum);
}

/** True when every condition set on the rule matches the contract. A rule with no conditions matches everything. */
export function approvalRuleMatches(rule: ApprovalRuleShape, contract: ApprovalSubjectShape): boolean {
  if (!rule.active) return false;
  if (rule.minValue !== null) {
    // Value thresholds apply only in their own currency; currencies are never converted.
    if (!rule.currency || rule.currency !== contract.currency || contract.value === null) return false;
    if (!decimalAtLeast(contract.value, rule.minValue)) return false;
  } else if (rule.currency && rule.currency !== contract.currency) return false;
  if (rule.categoryId && rule.categoryId !== contract.categoryId) return false;
  if (rule.typeId && rule.typeId !== contract.typeId) return false;
  if (rule.branchId && rule.branchId !== contract.branchId) return false;
  if (rule.department && !sameText(rule.department, contract.department)) return false;
  if (rule.jurisdiction && !sameText(rule.jurisdiction, contract.governingJurisdiction)) return false;
  if (rule.minRiskLevel && RISK_ORDER[contract.riskLevel] < RISK_ORDER[rule.minRiskLevel]) return false;
  return true;
}

/** The first matching active rule by priority (lowest number first), then name. */
export function selectApprovalRule<T extends ApprovalRuleShape>(rules: T[], contract: ApprovalSubjectShape): T | null {
  const ordered = [...rules].sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return ordered.find((rule) => approvalRuleMatches(rule, contract)) ?? null;
}

/** Whether the user is the assigned approver of a step, directly or through their role. */
export function isStepApprover(step: { approverUserId: string | null; approverRoleId: string | null }, user: { userId: string; roleId: string | null }) {
  return (!!step.approverUserId && step.approverUserId === user.userId) || (!!step.approverRoleId && step.approverRoleId === user.roleId);
}

// --- Dates, recurrence, notice ---------------------------------------------

const DAY_MS = 86_400_000;

/** Adds calendar months in UTC, clamping to the last day of shorter months (31 Jan + 1 month = 28 or 29 Feb). */
export function addMonths(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(date.getUTCDate(), lastDay), date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds()));
}

export const RECURRENCE_MONTHS = { NONE: 0, MONTHLY: 1, QUARTERLY: 3, SEMI_ANNUAL: 6, ANNUAL: 12 } as const;
export type Recurrence = keyof typeof RECURRENCE_MONTHS;

export function nextOccurrence(dueDate: Date, recurrence: Recurrence): Date | null {
  const months = RECURRENCE_MONTHS[recurrence];
  return months ? addMonths(dueDate, months) : null;
}

/** Last day to give notice before the expiration date. */
export function noticeDeadline(expirationDate: Date | null, noticePeriodDays: number | null): Date | null {
  if (!expirationDate || noticePeriodDays === null || noticePeriodDays === undefined) return null;
  return new Date(expirationDate.getTime() - noticePeriodDays * DAY_MS);
}

/** Days of contractual notice missing between the notice date and the effective termination date. */
export function noticeShortfallDays(noticeGivenAt: Date, effectiveDate: Date, noticePeriodDays: number | null): number {
  if (!noticePeriodDays) return 0;
  const given = Math.floor((effectiveDate.getTime() - noticeGivenAt.getTime()) / DAY_MS);
  return Math.max(0, noticePeriodDays - given);
}

/**
 * The reminder band a due date falls in: the smallest configured threshold
 * that has been reached, -1 once the date has passed, or null when no
 * threshold is reached yet. Each band is delivered once, so a reminder that
 * first runs late sends one notice rather than a burst.
 */
export function reminderBand(daysUntilDue: number, thresholds: number[]): number | null {
  if (daysUntilDue < 0) return -1;
  const reached = thresholds.filter((threshold) => daysUntilDue <= threshold);
  return reached.length ? Math.min(...reached) : null;
}

// --- Amendments ---------------------------------------------------------------

export const AMENDABLE_FIELDS = [
  "title", "value", "currency", "expirationDate", "renewalDate", "noticePeriodDays", "renewalType", "renewalTermMonths",
  "paymentTerms", "billingFrequency", "governingLaw", "governingJurisdiction", "description", "body",
] as const;
export type AmendableField = (typeof AMENDABLE_FIELDS)[number];

const RENEWAL_TYPE_VALUES = ["FIXED_TERM", "EVERGREEN", "AUTO_RENEWAL", "MANUAL_RENEWAL", "NO_RENEWAL"];

/**
 * Validates proposed amendment values (form strings) and returns the JSON
 * stored on the amendment. Empty values are ignored, so an amendment lists
 * only what it changes.
 */
export function parseAmendmentChanges(raw: Partial<Record<AmendableField, string | null | undefined>>): Partial<Record<AmendableField, string | number>> {
  const changes: Partial<Record<AmendableField, string | number>> = {};
  for (const field of AMENDABLE_FIELDS) {
    const input = raw[field];
    if (input === undefined || input === null || !String(input).trim()) continue;
    const value = String(input).trim();
    if (field === "value") {
      if (!/^\d{1,14}(\.\d{1,2})?$/.test(value)) throw new ContractRuleError("Amended value must be zero or more with at most two decimal places.");
      changes.value = value;
    } else if (field === "currency") {
      if (!/^[A-Za-z]{3}$/.test(value)) throw new ContractRuleError("Amended currency must be a three-letter code.");
      changes.currency = value.toUpperCase();
    } else if (field === "expirationDate" || field === "renewalDate") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) throw new ContractRuleError("Amended dates must be calendar dates.");
      changes[field] = value;
    } else if (field === "noticePeriodDays" || field === "renewalTermMonths") {
      const number = Number(value);
      const [min, max] = field === "noticePeriodDays" ? [0, 3650] : [1, 600];
      if (!Number.isInteger(number) || number < min || number > max) throw new ContractRuleError(field === "noticePeriodDays" ? "Notice period must be between 0 and 3650 days." : "Renewal term must be between 1 and 600 months.");
      changes[field] = number;
    } else if (field === "renewalType") {
      if (!RENEWAL_TYPE_VALUES.includes(value)) throw new ContractRuleError("Choose a valid renewal type.");
      changes.renewalType = value;
    } else {
      const max = field === "body" ? 200_000 : field === "description" ? 5000 : 200;
      changes[field] = value.slice(0, max);
    }
  }
  if (!Object.keys(changes).length) throw new ContractRuleError("An amendment must change at least one term.");
  return changes;
}

// --- Calendar -----------------------------------------------------------------

export type CalendarEventKind = "EXPIRATION" | "RENEWAL" | "NOTICE_DEADLINE" | "OBLIGATION" | "MILESTONE";
export type CalendarEvent = { date: Date; kind: CalendarEventKind; title: string; contractId: string; contractNumber: string; overdue: boolean };

/** Builds the dated events of a calendar window from contracts, open obligations, and planned milestones. */
export function buildCalendarEvents(
  input: {
    contracts: { id: string; contractNumber: string; title: string; status: string; expirationDate: Date | null; renewalDate: Date | null; noticePeriodDays: number | null }[];
    obligations: { contractId: string; contractNumber: string; title: string; dueDate: Date; status: string }[];
    milestones: { contractId: string; contractNumber: string; title: string; dueDate: Date; status: string }[];
  },
  from: Date,
  to: Date,
  now: Date = new Date(),
): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const inRange = (date: Date | null): date is Date => !!date && date >= from && date < to;
  for (const contract of input.contracts) {
    if (contract.status !== "ACTIVE" && contract.status !== "APPROVED") continue;
    const deadline = noticeDeadline(contract.expirationDate, contract.noticePeriodDays);
    if (inRange(contract.expirationDate)) events.push({ date: contract.expirationDate, kind: "EXPIRATION", title: `${contract.title} expires`, contractId: contract.id, contractNumber: contract.contractNumber, overdue: contract.expirationDate < now });
    if (inRange(contract.renewalDate)) events.push({ date: contract.renewalDate, kind: "RENEWAL", title: `${contract.title} renewal date`, contractId: contract.id, contractNumber: contract.contractNumber, overdue: false });
    if (contract.noticePeriodDays && inRange(deadline)) events.push({ date: deadline, kind: "NOTICE_DEADLINE", title: `Notice deadline: ${contract.title}`, contractId: contract.id, contractNumber: contract.contractNumber, overdue: deadline < now });
  }
  for (const obligation of input.obligations) {
    if ((obligation.status === "OPEN" || obligation.status === "IN_PROGRESS") && inRange(obligation.dueDate)) events.push({ date: obligation.dueDate, kind: "OBLIGATION", title: obligation.title, contractId: obligation.contractId, contractNumber: obligation.contractNumber, overdue: obligation.dueDate < now });
  }
  for (const milestone of input.milestones) {
    if (milestone.status === "PLANNED" && inRange(milestone.dueDate)) events.push({ date: milestone.dueDate, kind: "MILESTONE", title: milestone.title, contractId: milestone.contractId, contractNumber: milestone.contractNumber, overdue: milestone.dueDate < now });
  }
  return events.sort((a, b) => a.date.getTime() - b.date.getTime() || a.kind.localeCompare(b.kind));
}
