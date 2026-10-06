import "server-only";

import { Prisma, type TaxExemptionType, type TaxFilingFrequency, type TaxJurisdictionLevel, type TaxKind, type TaxRegistrationStatus, type TaxTreatment } from "@prisma/client";
import { db } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit";
import { calculateTaxes, type TaxCalculation, type TaxComponentInput } from "./engine";
import { getJurisdictionPack, homeCountryForJurisdiction } from "./packs";

export class TaxConfigurationError extends Error {}

type Tx = Prisma.TransactionClient;

function dateOnly(value: string | Date): Date {
  const date = typeof value === "string" ? new Date(`${value.slice(0, 10)}T00:00:00.000Z`) : value;
  if (Number.isNaN(date.getTime())) throw new TaxConfigurationError("Enter a valid date.");
  return date;
}

function parseRate(value: string): Prisma.Decimal {
  let rate: Prisma.Decimal;
  try {
    rate = new Prisma.Decimal(value);
  } catch {
    throw new TaxConfigurationError("Tax rate must be a number.");
  }
  if (!rate.isFinite() || rate.isNegative() || rate.greaterThan(100)) throw new TaxConfigurationError("Tax rate must be between 0 and 100 percent.");
  if (rate.decimalPlaces() > 6) throw new TaxConfigurationError("Tax rate supports at most 6 decimal places.");
  return rate;
}

function normalizeCode(code: string) {
  const value = code.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{0,63}$/.test(value)) throw new TaxConfigurationError("Codes use letters, numbers, hyphens, and underscores.");
  return value;
}

// --- Pack provisioning -----------------------------------------------------

/**
 * Seeds a jurisdiction pack into the organization's tax configuration.
 * Idempotent: existing jurisdictions, authorities, categories, rates, and
 * rules (matched by code) are left untouched, so administrator changes are
 * never overwritten by re-provisioning.
 */
export async function provisionJurisdictionPack(organizationId: string, packKey: string, actorId: string | null) {
  // The EU pack is built for the organization's own member state.
  const organization = await db.organization.findUnique({ where: { id: organizationId }, select: { jurisdictionCode: true, country: true } });
  const homeCountry = homeCountryForJurisdiction(organization?.jurisdictionCode) ?? organization?.country ?? null;
  const pack = getJurisdictionPack(packKey, { homeCountry });
  if (!pack) throw new TaxConfigurationError(packKey.toUpperCase() === "EU" ? "Set the organization country to an EU member state before applying the EU pack." : `No jurisdiction pack is available for ${packKey}.`);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${organizationId}:tax-configuration`}))`;
    const jurisdictionIds = new Map<string, string>();
    for (const jurisdiction of pack.jurisdictions) {
      const parentId = jurisdiction.parentCode ? jurisdictionIds.get(jurisdiction.parentCode) ?? (await tx.taxJurisdiction.findUnique({ where: { organizationId_code: { organizationId, code: jurisdiction.parentCode } }, select: { id: true } }))?.id ?? null : null;
      const row = await tx.taxJurisdiction.upsert({
        where: { organizationId_code: { organizationId, code: jurisdiction.code } },
        update: {},
        create: { organizationId, code: jurisdiction.code, name: jurisdiction.name, level: jurisdiction.level, countryCode: jurisdiction.countryCode ?? null, parentId, packKey: pack.key },
        select: { id: true },
      });
      jurisdictionIds.set(jurisdiction.code, row.id);
    }
    const authorityIds = new Map<string, string>();
    for (const authority of pack.authorities) {
      const row = await tx.taxAuthority.upsert({
        where: { organizationId_code: { organizationId, code: authority.code } },
        update: {},
        create: { organizationId, code: authority.code, name: authority.name, website: authority.website ?? null, jurisdictionId: jurisdictionIds.get(authority.jurisdictionCode)! },
        select: { id: true },
      });
      authorityIds.set(authority.code, row.id);
    }
    const categoryIds = new Map<string, string>();
    for (const category of pack.categories) {
      const row = await tx.taxCategory.upsert({
        where: { organizationId_code: { organizationId, code: category.code } },
        update: {},
        create: { organizationId, code: category.code, name: category.name, description: category.description ?? null },
        select: { id: true },
      });
      categoryIds.set(category.code, row.id);
    }
    let ratesCreated = 0;
    for (const rate of pack.rates) {
      const existing = await tx.taxRate.findFirst({ where: { organizationId, code: rate.code }, select: { id: true } });
      if (existing) continue;
      await tx.taxRate.create({
        data: {
          organizationId, code: rate.code, name: rate.name, jurisdictionId: jurisdictionIds.get(rate.jurisdictionCode)!, authorityId: rate.authorityCode ? authorityIds.get(rate.authorityCode) ?? null : null,
          taxKind: rate.taxKind, rate: rate.rate, compound: rate.compound ?? false, recoverable: rate.recoverable ?? true, effectiveFrom: dateOnly(rate.effectiveFrom),
          sourceReference: rate.sourceReference ?? null, outputAccountCode: rate.outputAccountCode ?? null, inputAccountCode: rate.inputAccountCode ?? null, createdById: actorId,
        },
      });
      ratesCreated += 1;
    }
    let rulesCreated = 0;
    for (const rule of pack.rules) {
      const existing = await tx.taxRule.findFirst({ where: { organizationId, code: rule.code }, select: { id: true } });
      if (existing) continue;
      await tx.taxRule.create({
        data: {
          organizationId, code: rule.code, name: rule.name, jurisdictionId: jurisdictionIds.get(rule.jurisdictionCode)!, categoryId: rule.categoryCode ? categoryIds.get(rule.categoryCode) ?? null : null,
          treatment: rule.treatment, rateCodes: rule.rateCodes, effectiveFrom: dateOnly(rule.effectiveFrom), sourceReference: rule.sourceReference ?? null, createdById: actorId,
        },
      });
      rulesCreated += 1;
    }
    let accountsCreated = 0;
    if (pack.accounts?.length) {
      // Separate ledger accounts (for example US federal and employment
      // taxes); an existing account with the same code is left as is.
      const created = await tx.accountingAccount.createMany({ data: pack.accounts.map((account) => ({ organizationId, code: account.code, name: account.name, type: account.type })), skipDuplicates: true });
      accountsCreated = created.count;
    }
    await logAuditEvent({ organizationId, userId: actorId, module: "accounting", action: "tax_pack.provisioned", entityName: "TaxJurisdiction", metadata: { pack: pack.key, name: pack.name, version: pack.version, ratesCreated, rulesCreated, accountsCreated } }, tx);
    return { pack: pack.key, ratesCreated, rulesCreated, accountsCreated };
  }, { timeout: 30_000 });
}

// --- Configuration reads --------------------------------------------------

export async function getTaxConfiguration(organizationId: string) {
  const [jurisdictions, authorities, categories, rates, rules, registrations, exemptions] = await Promise.all([
    db.taxJurisdiction.findMany({ where: { organizationId }, orderBy: [{ level: "asc" }, { code: "asc" }] }),
    db.taxAuthority.findMany({ where: { organizationId }, orderBy: { code: "asc" } }),
    db.taxCategory.findMany({ where: { organizationId }, orderBy: { code: "asc" } }),
    db.taxRate.findMany({ where: { organizationId }, include: { jurisdiction: { select: { code: true } }, authority: { select: { name: true } } }, orderBy: [{ code: "asc" }, { version: "desc" }] }),
    db.taxRule.findMany({ where: { organizationId }, include: { jurisdiction: { select: { code: true } }, category: { select: { code: true } } }, orderBy: [{ code: "asc" }, { version: "desc" }] }),
    db.taxRegistration.findMany({ where: { organizationId }, include: { jurisdiction: { select: { code: true, name: true } } }, orderBy: { createdAt: "asc" } }),
    db.taxExemption.findMany({ where: { organizationId }, include: { contact: { select: { name: true } }, jurisdiction: { select: { code: true } } }, orderBy: { createdAt: "desc" }, take: 200 }),
  ]);
  return { jurisdictions, authorities, categories, rates, rules, registrations, exemptions };
}

/** Rules usable for a document dated `date` (latest effective version of each code). */
export async function listApplicableRules(organizationId: string, date: Date = new Date()) {
  const rules = await db.taxRule.findMany({
    where: { organizationId, active: true, effectiveFrom: { lte: date }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }] },
    include: { jurisdiction: { select: { code: true, name: true } } },
    orderBy: [{ code: "asc" }, { version: "desc" }],
  });
  const seen = new Set<string>();
  return rules.filter((rule) => (seen.has(rule.code) ? false : (seen.add(rule.code), true)));
}

// --- Configuration writes -------------------------------------------------

export async function createJurisdiction(organizationId: string, actorId: string, input: { code: string; name: string; level: TaxJurisdictionLevel; countryCode?: string | null; parentCode?: string | null }) {
  const code = normalizeCode(input.code);
  const name = input.name.trim();
  if (!name) throw new TaxConfigurationError("Jurisdiction name is required.");
  const parent = input.parentCode ? await db.taxJurisdiction.findUnique({ where: { organizationId_code: { organizationId, code: normalizeCode(input.parentCode) } }, select: { id: true } }) : null;
  if (input.parentCode && !parent) throw new TaxConfigurationError("Parent jurisdiction not found.");
  try {
    const created = await db.taxJurisdiction.create({ data: { organizationId, code, name, level: input.level, countryCode: input.countryCode?.trim().toUpperCase() || null, parentId: parent?.id ?? null } });
    await logAuditEvent({ organizationId, userId: actorId, module: "accounting", action: "tax_jurisdiction.created", entityName: "TaxJurisdiction", entityId: created.id, metadata: { code, level: input.level } });
    return created;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new TaxConfigurationError(`Jurisdiction ${code} already exists.`);
    throw error;
  }
}

export async function createTaxCategory(organizationId: string, actorId: string, input: { code: string; name: string; description?: string | null }) {
  const code = normalizeCode(input.code);
  try {
    const created = await db.taxCategory.create({ data: { organizationId, code, name: input.name.trim(), description: input.description?.trim() || null } });
    await logAuditEvent({ organizationId, userId: actorId, module: "accounting", action: "tax_category.created", entityName: "TaxCategory", entityId: created.id, metadata: { code } });
    return created;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new TaxConfigurationError(`Category ${code} already exists.`);
    throw error;
  }
}

export async function createTaxRate(organizationId: string, actorId: string, input: { code: string; name: string; jurisdictionCode: string; taxKind: TaxKind; rate: string; compound?: boolean; recoverable?: boolean; effectiveFrom: string; sourceReference?: string | null; outputAccountCode?: string | null; inputAccountCode?: string | null }) {
  const code = normalizeCode(input.code);
  const rate = parseRate(input.rate);
  const jurisdiction = await db.taxJurisdiction.findUnique({ where: { organizationId_code: { organizationId, code: normalizeCode(input.jurisdictionCode) } }, select: { id: true } });
  if (!jurisdiction) throw new TaxConfigurationError("Jurisdiction not found.");
  if (await db.taxRate.findFirst({ where: { organizationId, code }, select: { id: true } })) throw new TaxConfigurationError(`Rate ${code} already exists. Record a new version to change it.`);
  const created = await db.taxRate.create({
    data: { organizationId, code, name: input.name.trim(), jurisdictionId: jurisdiction.id, taxKind: input.taxKind, rate, compound: input.compound ?? false, recoverable: input.recoverable ?? true, effectiveFrom: dateOnly(input.effectiveFrom), sourceReference: input.sourceReference?.trim() || null, outputAccountCode: input.outputAccountCode?.trim() || null, inputAccountCode: input.inputAccountCode?.trim() || null, createdById: actorId },
  });
  await logAuditEvent({ organizationId, userId: actorId, module: "accounting", action: "tax_rate.created", entityName: "TaxRate", entityId: created.id, metadata: { code, rate: rate.toString(), effectiveFrom: input.effectiveFrom } });
  return created;
}

/**
 * Changes a rate from a date by adding a new version. The prior version is
 * closed the day before; its value is never edited, so documents dated
 * before the change keep the old rate. A change cannot start on or before
 * the current version's start (that would rewrite a period already covered).
 */
export async function createTaxRateVersion(organizationId: string, actorId: string, input: { code: string; rate: string; effectiveFrom: string; sourceReference?: string | null }) {
  const code = normalizeCode(input.code);
  const rate = parseRate(input.rate);
  const effectiveFrom = dateOnly(input.effectiveFrom);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${organizationId}:tax-rate:${code}`}))`;
    const current = await tx.taxRate.findFirst({ where: { organizationId, code }, orderBy: { version: "desc" } });
    if (!current) throw new TaxConfigurationError("Rate not found.");
    if (effectiveFrom <= current.effectiveFrom) throw new TaxConfigurationError("A new rate must start after the current version's start date. Historical rates cannot be rewritten.");
    const closeOn = new Date(effectiveFrom.getTime() - 1);
    if (current.effectiveTo && current.effectiveTo < closeOn) throw new TaxConfigurationError("The current version has already ended; record the new version from its end date.");
    await tx.taxRate.update({ where: { id: current.id }, data: { effectiveTo: closeOn } });
    const created = await tx.taxRate.create({
      data: {
        organizationId, code, name: current.name, jurisdictionId: current.jurisdictionId, authorityId: current.authorityId, taxKind: current.taxKind, rate, compound: current.compound, recoverable: current.recoverable,
        effectiveFrom, version: current.version + 1, supersedesId: current.id, sourceReference: input.sourceReference?.trim() || current.sourceReference, outputAccountCode: current.outputAccountCode, inputAccountCode: current.inputAccountCode, createdById: actorId,
      },
    });
    await logAuditEvent({ organizationId, userId: actorId, module: "accounting", action: "tax_rate.version_created", entityName: "TaxRate", entityId: created.id, metadata: { code, previousRate: current.rate.toString(), rate: rate.toString(), effectiveFrom: input.effectiveFrom, previousVersion: current.version, version: created.version } }, tx);
    return created;
  });
}

export async function createTaxRule(organizationId: string, actorId: string, input: { code: string; name: string; jurisdictionCode: string; categoryCode?: string | null; treatment: TaxTreatment; rateCodes: string[]; effectiveFrom: string; sourceReference?: string | null }) {
  const code = normalizeCode(input.code);
  const rateCodes = [...new Set(input.rateCodes.map(normalizeCode))];
  const jurisdiction = await db.taxJurisdiction.findUnique({ where: { organizationId_code: { organizationId, code: normalizeCode(input.jurisdictionCode) } }, select: { id: true } });
  if (!jurisdiction) throw new TaxConfigurationError("Jurisdiction not found.");
  const category = input.categoryCode ? await db.taxCategory.findUnique({ where: { organizationId_code: { organizationId, code: normalizeCode(input.categoryCode) } }, select: { id: true } }) : null;
  if (input.categoryCode && !category) throw new TaxConfigurationError("Category not found.");
  const knownRates = await db.taxRate.findMany({ where: { organizationId, code: { in: rateCodes } }, select: { code: true }, distinct: ["code"] });
  if (knownRates.length !== rateCodes.length) throw new TaxConfigurationError("Every rate code in a rule must exist in this organization.");
  if (await db.taxRule.findFirst({ where: { organizationId, code }, select: { id: true } })) throw new TaxConfigurationError(`Rule ${code} already exists.`);
  const created = await db.taxRule.create({ data: { organizationId, code, name: input.name.trim(), jurisdictionId: jurisdiction.id, categoryId: category?.id ?? null, treatment: input.treatment, rateCodes, effectiveFrom: dateOnly(input.effectiveFrom), sourceReference: input.sourceReference?.trim() || null, createdById: actorId } });
  await logAuditEvent({ organizationId, userId: actorId, module: "accounting", action: "tax_rule.created", entityName: "TaxRule", entityId: created.id, metadata: { code, treatment: input.treatment, rateCodes } });
  return created;
}

export async function setTaxRuleActive(organizationId: string, actorId: string, ruleId: string, active: boolean) {
  const result = await db.taxRule.updateMany({ where: { id: ruleId, organizationId }, data: { active } });
  if (result.count !== 1) throw new TaxConfigurationError("Rule not found.");
  await logAuditEvent({ organizationId, userId: actorId, module: "accounting", action: active ? "tax_rule.activated" : "tax_rule.deactivated", entityName: "TaxRule", entityId: ruleId });
}

export async function upsertTaxRegistration(organizationId: string, actorId: string, input: { jurisdictionCode: string; registrationNumber?: string | null; status: TaxRegistrationStatus; collectionEnabled: boolean; filingFrequency?: TaxFilingFrequency | null; effectiveFrom?: string | null; notes?: string | null }) {
  const jurisdiction = await db.taxJurisdiction.findUnique({ where: { organizationId_code: { organizationId, code: normalizeCode(input.jurisdictionCode) } }, select: { id: true } });
  if (!jurisdiction) throw new TaxConfigurationError("Jurisdiction not found.");
  if (input.collectionEnabled && input.status !== "REGISTERED") throw new TaxConfigurationError("Tax collection can be enabled only for a registered jurisdiction.");
  const data = { registrationNumber: input.registrationNumber?.trim() || null, status: input.status, collectionEnabled: input.collectionEnabled, filingFrequency: input.filingFrequency ?? null, effectiveFrom: input.effectiveFrom ? dateOnly(input.effectiveFrom) : null, notes: input.notes?.trim() || null };
  const previous = await db.taxRegistration.findUnique({ where: { organizationId_jurisdictionId: { organizationId, jurisdictionId: jurisdiction.id } } });
  const saved = await db.taxRegistration.upsert({ where: { organizationId_jurisdictionId: { organizationId, jurisdictionId: jurisdiction.id } }, update: data, create: { organizationId, jurisdictionId: jurisdiction.id, ...data } });
  const mask = (value: string | null | undefined) => (value ? `****${value.slice(-4)}` : null);
  await logAuditEvent({ organizationId, userId: actorId, module: "accounting", action: "tax_registration.updated", entityName: "TaxRegistration", entityId: saved.id, metadata: { jurisdiction: input.jurisdictionCode, from: previous ? { status: previous.status, collectionEnabled: previous.collectionEnabled, registrationNumber: mask(previous.registrationNumber) } : null, to: { status: saved.status, collectionEnabled: saved.collectionEnabled, registrationNumber: mask(saved.registrationNumber) } } });
  return saved;
}

export async function createTaxExemption(organizationId: string, actorId: string, input: { contactId: string; jurisdictionCode?: string | null; exemptionType: TaxExemptionType; certificateNumber?: string | null; reason?: string | null; validFrom: string; validTo?: string | null }) {
  const contact = await db.accountingContact.findFirst({ where: { id: input.contactId, organizationId }, select: { id: true } });
  if (!contact) throw new TaxConfigurationError("Contact not found.");
  const jurisdiction = input.jurisdictionCode ? await db.taxJurisdiction.findUnique({ where: { organizationId_code: { organizationId, code: normalizeCode(input.jurisdictionCode) } }, select: { id: true } }) : null;
  if (input.jurisdictionCode && !jurisdiction) throw new TaxConfigurationError("Jurisdiction not found.");
  const validFrom = dateOnly(input.validFrom);
  const validTo = input.validTo ? dateOnly(input.validTo) : null;
  if (validTo && validTo < validFrom) throw new TaxConfigurationError("An exemption cannot end before it starts.");
  const created = await db.taxExemption.create({ data: { organizationId, contactId: contact.id, jurisdictionId: jurisdiction?.id ?? null, exemptionType: input.exemptionType, certificateNumber: input.certificateNumber?.trim() || null, reason: input.reason?.trim() || null, validFrom, validTo, createdById: actorId } });
  await logAuditEvent({ organizationId, userId: actorId, module: "accounting", action: "tax_exemption.created", entityName: "TaxExemption", entityId: created.id, metadata: { contactId: contact.id, exemptionType: input.exemptionType, jurisdiction: input.jurisdictionCode ?? "ALL" } });
  return created;
}

// --- Document tax resolution ----------------------------------------------

export type ResolvedDocumentTax = {
  rule: { id: string; code: string; name: string; jurisdictionCode: string; treatment: TaxTreatment };
  treatment: TaxTreatment;
  customerExempt: boolean;
  skippedComponents: string[];
  calculation: TaxCalculation;
  /** Per-line account mapping carried into the document snapshot. */
  accounts: Map<string, { outputAccountCode: string | null; inputAccountCode: string | null; rateId: string; taxKind: TaxKind }>;
};

/**
 * Server-authoritative tax for a new document. Resolves the rule and every
 * rate component in effect on the document date, applies a valid customer
 * exemption, skips components in jurisdictions where collection is
 * explicitly disabled, and calculates exact amounts. Client-supplied tax
 * amounts are never used.
 */
export async function resolveDocumentTax(organizationId: string, input: { ruleId: string; date: Date; amount: Prisma.Decimal.Value; pricesIncludeTax: boolean; contactId?: string | null; client?: Tx }): Promise<ResolvedDocumentTax> {
  const client = input.client ?? db;
  const selected = await client.taxRule.findFirst({ where: { id: input.ruleId, organizationId }, select: { code: true } });
  if (!selected) throw new TaxConfigurationError("Tax rule not found.");
  // Use the version of this rule in effect on the document date.
  const rule = await client.taxRule.findFirst({
    where: { organizationId, code: selected.code, active: true, effectiveFrom: { lte: input.date }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: input.date } }] },
    include: { jurisdiction: { select: { id: true, code: true } } },
    orderBy: { version: "desc" },
  });
  if (!rule) throw new TaxConfigurationError(`Tax rule ${selected.code} is not in effect on the document date.`);

  const rates = await client.taxRate.findMany({
    where: { organizationId, code: { in: rule.rateCodes }, effectiveFrom: { lte: input.date }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: input.date } }] },
    include: { jurisdiction: { select: { id: true, code: true, level: true } }, authority: { select: { name: true } } },
    orderBy: { version: "desc" },
  });
  const byCode = new Map<string, (typeof rates)[number]>();
  for (const rate of rates) if (!byCode.has(rate.code)) byCode.set(rate.code, rate);
  const missing = rule.rateCodes.filter((code) => !byCode.has(code));
  if (missing.length) throw new TaxConfigurationError(`No rate is in effect on the document date for ${missing.join(", ")}.`);

  const jurisdictionIds = [...new Set([...byCode.values()].map((rate) => rate.jurisdictionId))];
  const disabled = await client.taxRegistration.findMany({ where: { organizationId, jurisdictionId: { in: jurisdictionIds }, collectionEnabled: false }, select: { jurisdictionId: true } });
  const disabledIds = new Set(disabled.map((registration) => registration.jurisdictionId));

  const skippedComponents: string[] = [];
  const components: TaxComponentInput[] = [];
  const accounts: ResolvedDocumentTax["accounts"] = new Map();
  rule.rateCodes.forEach((code, index) => {
    const rate = byCode.get(code)!;
    if (disabledIds.has(rate.jurisdictionId)) {
      skippedComponents.push(code);
      return;
    }
    components.push({ rateId: rate.id, code: rate.code, name: rate.name, taxType: rate.taxKind, jurisdictionCode: rate.jurisdiction.code, jurisdictionLevel: rate.jurisdiction.level, authorityName: rate.authority?.name ?? null, rate: rate.rate, compound: rate.compound, recoverable: rate.recoverable, sortOrder: index });
    accounts.set(rate.code, { outputAccountCode: rate.outputAccountCode, inputAccountCode: rate.inputAccountCode, rateId: rate.id, taxKind: rate.taxKind });
  });

  let customerExempt = false;
  if (input.contactId) {
    const exemption = await client.taxExemption.findFirst({
      where: { organizationId, contactId: input.contactId, validFrom: { lte: input.date }, AND: [{ OR: [{ validTo: null }, { validTo: { gte: input.date } }] }, { OR: [{ jurisdictionId: null }, { jurisdictionId: { in: [rule.jurisdiction.id, ...jurisdictionIds] } }] }] },
      select: { id: true },
    });
    customerExempt = !!exemption;
  }
  const treatment: TaxTreatment = customerExempt && (rule.treatment === "STANDARD" || rule.treatment === "REDUCED") ? "EXEMPT" : rule.treatment;
  const calculation = calculateTaxes({ amount: input.amount, components, treatment, pricesIncludeTax: input.pricesIncludeTax });
  return { rule: { id: rule.id, code: rule.code, name: rule.name, jurisdictionCode: rule.jurisdiction.code, treatment: rule.treatment }, treatment, customerExempt, skippedComponents, calculation, accounts };
}
