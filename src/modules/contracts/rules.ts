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
