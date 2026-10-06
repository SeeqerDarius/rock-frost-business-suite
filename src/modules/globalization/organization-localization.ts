import "server-only";

import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit";
import {
  DATE_FORMATS,
  LEGAL_ENTITY_TYPES,
  NUMBER_FORMATS,
  SUPPORTED_LANGUAGES,
  getCountryProfile,
  isValidCurrencyCode,
  isValidLocale,
  isValidTimeZone,
  normalizeCountryCode,
} from "@/lib/localization";

export class LocalizationSettingsError extends Error {}
export class BaseCurrencyLockedError extends LocalizationSettingsError {}

const optionalText = (max: number) => z.string().trim().max(max).transform((value) => value || null).nullable().optional();

export const localizationSettingsSchema = z.object({
  legalName: optionalText(200),
  tradingName: optionalText(200),
  country: z.string().trim().min(2).max(60).transform((value, ctx) => {
    const code = normalizeCountryCode(value);
    if (!code) { ctx.addIssue({ code: "custom", message: "Choose a country." }); return z.NEVER; }
    return code;
  }),
  region: optionalText(120),
  city: optionalText(120),
  address: optionalText(500),
  postalCode: optionalText(40),
  legalEntityType: z.enum(LEGAL_ENTITY_TYPES).nullable().optional(),
  taxNumber: optionalText(60),
  vatRegistrationNumber: optionalText(60),
  businessRegistrationNumber: optionalText(80),
  currency: z.string().trim().toUpperCase().refine(isValidCurrencyCode, "Choose a valid ISO 4217 currency."),
  fiscalYearStartMonth: z.coerce.number().int().min(1).max(12),
  accountingBasis: z.enum(["ACCRUAL", "CASH"]),
  timezone: z.string().trim().refine(isValidTimeZone, "Choose a valid IANA timezone."),
  locale: z.string().trim().refine(isValidLocale, "Choose a valid locale."),
  dateFormat: z.enum(Object.keys(DATE_FORMATS) as [keyof typeof DATE_FORMATS, ...(keyof typeof DATE_FORMATS)[]]),
  numberFormat: z.enum(Object.keys(NUMBER_FORMATS) as [keyof typeof NUMBER_FORMATS, ...(keyof typeof NUMBER_FORMATS)[]]),
  defaultLanguage: z.enum(Object.keys(SUPPORTED_LANGUAGES) as [keyof typeof SUPPORTED_LANGUAGES, ...(keyof typeof SUPPORTED_LANGUAGES)[]]),
  pricesIncludeTax: z.boolean(),
  confirmBaseCurrencyChange: z.boolean().default(false),
  confirmJurisdictionChange: z.boolean().default(false),
});

export type LocalizationSettingsInput = z.input<typeof localizationSettingsSchema>;

export const LOCALIZATION_SELECT = {
  id: true, name: true, legalName: true, tradingName: true, country: true, region: true, city: true, address: true,
  postalCode: true, legalEntityType: true, taxNumber: true, vatRegistrationNumber: true, businessRegistrationNumber: true,
  currency: true, fiscalYearStartMonth: true, accountingBasis: true, timezone: true, locale: true, dateFormat: true,
  numberFormat: true, defaultLanguage: true, pricesIncludeTax: true, jurisdictionCode: true,
} satisfies Prisma.OrganizationSelect;

export async function getLocalizationSettings(organizationId: string) {
  const organization = await db.organization.findUniqueOrThrow({ where: { id: organizationId }, select: LOCALIZATION_SELECT });
  const countryCode = normalizeCountryCode(organization.country);
  return { organization, countryCode, profile: getCountryProfile(countryCode), history: await getAccountingHistoryState(organizationId) };
}

/**
 * Whether the organization already has accounting records denominated in
 * its base currency. Once it does, changing the base currency would silently
 * re-label historical amounts, so the change is refused.
 */
export async function getAccountingHistoryState(organizationId: string, client: Prisma.TransactionClient | typeof db = db) {
  const [journalEntries, invoices, bills, taxTransactions] = await Promise.all([
    client.accountingJournalEntry.count({ where: { organizationId } }),
    client.accountingInvoice.count({ where: { organizationId } }),
    client.accountingBill.count({ where: { organizationId } }),
    client.accountingTaxTransaction.count({ where: { organizationId } }),
  ]);
  return { journalEntries, invoices, bills, taxTransactions, hasAccountingHistory: journalEntries + invoices + bills > 0, hasTaxHistory: taxTransactions > 0 };
}

function maskIdentifier(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.length <= 4 ? "****" : `****${value.slice(-4)}`;
}

const MASKED_FIELDS = new Set(["taxNumber", "vatRegistrationNumber", "businessRegistrationNumber"]);

export async function updateLocalizationSettings(organizationId: string, actorId: string, rawInput: LocalizationSettingsInput) {
  const parsed = localizationSettingsSchema.safeParse(rawInput);
  if (!parsed.success) throw new LocalizationSettingsError(parsed.error.issues[0]?.message ?? "Check the localization settings and try again.");
  const { confirmBaseCurrencyChange, confirmJurisdictionChange, ...input } = parsed.data;
  const jurisdictionCode = getCountryProfile(input.country).jurisdictionCode;

  return db.$transaction(async (tx) => {
    // Serialize concurrent edits of one organization's settings.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${organizationId}:localization`}))`;
    const current = await tx.organization.findUniqueOrThrow({ where: { id: organizationId }, select: LOCALIZATION_SELECT });

    const baseCurrencyChanging = current.currency !== input.currency;
    const jurisdictionChanging = (current.jurisdictionCode ?? null) !== jurisdictionCode;
    if (baseCurrencyChanging || jurisdictionChanging) {
      const history = await getAccountingHistoryState(organizationId, tx);
      if (baseCurrencyChanging && history.hasAccountingHistory) {
        throw new BaseCurrencyLockedError(`The base currency is locked because this organization already has ${history.journalEntries} journal entries, ${history.invoices} invoices, and ${history.bills} bills in ${current.currency}. Record foreign-currency transactions instead.`);
      }
      if (baseCurrencyChanging && !confirmBaseCurrencyChange) throw new LocalizationSettingsError("Confirm that you want to change the base currency.");
      if (jurisdictionChanging && history.hasTaxHistory && !confirmJurisdictionChange) {
        throw new LocalizationSettingsError("This organization has recorded tax transactions. Confirm the jurisdiction change: existing tax records keep their original rates and jurisdiction.");
      }
    }

    const next = { ...input, jurisdictionCode };
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const [key, value] of Object.entries(next)) {
      const before = current[key as keyof typeof current] ?? null;
      const after = value ?? null;
      if (before !== after) changes[key] = MASKED_FIELDS.has(key) ? { from: maskIdentifier(before as string | null), to: maskIdentifier(after as string | null) } : { from: before, to: after };
    }
    if (Object.keys(changes).length === 0) return { organization: current, changed: [] as string[] };

    const organization = await tx.organization.update({ where: { id: organizationId }, data: next, select: LOCALIZATION_SELECT });
    await logAuditEvent({
      organizationId,
      userId: actorId,
      module: "administration",
      action: baseCurrencyChanging ? "organization.base_currency_changed" : "organization.localization_updated",
      entityName: "Organization",
      entityId: organizationId,
      metadata: { changes },
    }, tx);
    return { organization, changed: Object.keys(changes) };
  });
}
