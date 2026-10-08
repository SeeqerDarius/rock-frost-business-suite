import "server-only";

import { db } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit";
import { formatOnlyVatProvider, isViesCountry, validateVatNumber, type VatIdCheck, type ViesRequester } from "./providers";

export class VatCheckError extends Error {}

/**
 * The organization's own EU VAT number, sent to VIES as the requester so the
 * registry returns a consultation number (evidence of the check). Used only
 * when the organization is in a VIES country and its number is well formed.
 */
async function organizationRequester(organizationId: string): Promise<ViesRequester | null> {
  const organization = await db.organization.findUnique({ where: { id: organizationId }, select: { country: true, taxNumber: true } });
  if (!organization?.country || !organization.taxNumber || !isViesCountry(organization.country)) return null;
  const format = await formatOnlyVatProvider.validate(organization.country, organization.taxNumber);
  return format.valid ? { countryCode: organization.country, vatNumber: organization.taxNumber } : null;
}

/** Runs a VAT number check for an organization (with its requester details when available). */
export async function checkVatNumberForOrganization(organizationId: string, countryCode: string, vatNumber: string, fetchImpl?: typeof fetch) {
  return validateVatNumber(countryCode, vatNumber, { requester: await organizationRequester(organizationId), fetchImpl });
}

/** Stores a check as evidence on the contact and audits it. */
export async function recordVatCheck(organizationId: string, actorId: string | null, contactId: string | null, check: VatIdCheck) {
  const saved = await db.vatNumberCheck.create({
    data: {
      organizationId, contactId, countryCode: check.countryCode, vatNumber: check.normalized, level: check.level, status: check.status, provider: check.provider,
      registeredName: check.registeredName ?? null, registeredAddress: check.registeredAddress ?? null, consultationNumber: check.consultationNumber ?? null,
      message: check.message.slice(0, 500), checkedById: actorId, checkedAt: check.checkedAt,
    },
  });
  await logAuditEvent({ organizationId, userId: actorId, module: "accounting", action: "contact.vat_checked", entityName: "AccountingContact", entityId: contactId ?? saved.id, metadata: { checkId: saved.id, countryCode: check.countryCode, level: check.level, status: check.status, provider: check.provider, consultationNumber: check.consultationNumber ?? null } });
  return saved;
}

/** Re-checks a contact's VAT number now and records the result. */
export async function recheckContactVatNumber(organizationId: string, actorId: string | null, contactId: string, fetchImpl?: typeof fetch) {
  const contact = await db.accountingContact.findFirst({ where: { id: contactId, organizationId }, select: { id: true, countryCode: true, vatNumber: true } });
  if (!contact) throw new VatCheckError("Contact not found.");
  if (!contact.countryCode || !contact.vatNumber) throw new VatCheckError("Add the contact's country and VAT number first.");
  const check = await checkVatNumberForOrganization(organizationId, contact.countryCode, contact.vatNumber, fetchImpl);
  return recordVatCheck(organizationId, actorId, contact.id, check);
}

/** The most recent check per contact, for display. */
export async function latestVatChecks(organizationId: string, contactIds: string[]) {
  if (!contactIds.length) return new Map<string, Awaited<ReturnType<typeof db.vatNumberCheck.findFirst>>>();
  const checks = await db.vatNumberCheck.findMany({ where: { organizationId, contactId: { in: contactIds } }, orderBy: { checkedAt: "desc" } });
  const latest = new Map<string, (typeof checks)[number]>();
  for (const check of checks) if (check.contactId && !latest.has(check.contactId)) latest.set(check.contactId, check);
  return latest;
}
