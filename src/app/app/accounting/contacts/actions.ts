"use server";

import { z } from "zod";
import { isValidCurrencyCode } from "@/lib/localization";
import { checkVatNumberForOrganization, recheckContactVatNumber, recordVatCheck, VatCheckError } from "@/modules/tax/vat-checks";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import { createContact, updateContact, importContactsFromCsv, NotFoundError } from "@/modules/accounting/service";
import { shortText, longText, optionalEmail, optionalLongText, cuid, currencyCode, parseWithSchema } from "@/lib/validation";
import { parseCsv, findColumn, mapCsvRows, CsvParseError } from "@/lib/csv-import";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

const contactSchema = z.object({
  type: z.enum(["CUSTOMER", "SUPPLIER", "BOTH"]),
  name: shortText,
  email: optionalEmail,
  phone: longText.nullable().optional(),
  address: optionalLongText,
  taxIdentificationNumber: longText.nullable().optional(),
  currency: currencyCode.refine(isValidCurrencyCode, "Unsupported currency").nullable().optional(),
  countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).nullable().optional(),
  vatNumber: z.string().trim().max(40).nullable().optional(),
});

export async function upsertContact(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("accounting");
  if (!hasPermission(tenant, PERMISSIONS.ACCOUNTING_CONTACTS_MANAGE)) {
    redirect("/app/accounting/contacts?error=forbidden");
  }

  const id = clean(formData.get("id"));
  const parsed = parseWithSchema(contactSchema, {
    type: clean(formData.get("type")) ?? "CUSTOMER",
    name: clean(formData.get("name")),
    email: clean(formData.get("email")),
    phone: clean(formData.get("phone")),
    address: clean(formData.get("address")),
    taxIdentificationNumber: clean(formData.get("taxIdentificationNumber")),
    currency: clean(formData.get("currency")),
    countryCode: clean(formData.get("countryCode")),
    vatNumber: clean(formData.get("vatNumber")),
  });
  if (!parsed.success) {
    redirect("/app/accounting/contacts?error=invalid-input");
  }
  // EU and Northern Ireland numbers are checked with VIES; others by format. A registry outage never blocks saving.
  const vatCheck = parsed.data.vatNumber && parsed.data.countryCode ? await checkVatNumberForOrganization(tenant.organizationId, parsed.data.countryCode, parsed.data.vatNumber) : null;
  if (vatCheck?.status === "INVALID") redirect(`/app/accounting/contacts?error=${vatCheck.level === "REGISTRY" ? "invalid-vat-registry" : "invalid-vat"}`);

  const data = {
    type: parsed.data.type,
    name: parsed.data.name,
    email: parsed.data.email ?? null,
    phone: parsed.data.phone ?? null,
    address: parsed.data.address ?? null,
    taxIdentificationNumber: parsed.data.taxIdentificationNumber ?? null,
    currency: parsed.data.currency ?? null,
    countryCode: parsed.data.countryCode ?? null,
    vatNumber: parsed.data.vatNumber ?? null,
  };

  const session = await getServerAuthSession();
  let contactId: string;
  try {
    if (id) {
      const parsedId = parseWithSchema(cuid, id);
      if (!parsedId.success) redirect("/app/accounting/contacts?error=invalid-input");
      contactId = (await updateContact(tenant.organizationId, parsedId.data, data)).id;
    } else {
      contactId = (await createContact(tenant.organizationId, data, session?.user?.id ?? null)).id;
    }
  } catch (error) {
    if (error instanceof NotFoundError) redirect("/app/accounting/contacts?error=not-found");
    throw error;
  }
  if (vatCheck) await recordVatCheck(tenant.organizationId, session?.user?.id ?? null, contactId, vatCheck);

  revalidatePath("/app/accounting/contacts");
  redirect(`/app/accounting/contacts?saved=1${vatCheck?.status === "UNAVAILABLE" ? "&vat=unavailable" : ""}`);
}

/** Checks a contact's VAT number again now (for example before a reverse-charge invoice) and keeps the result as evidence. */
export async function recheckContactVatAction(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("accounting");
  if (!hasPermission(tenant, PERMISSIONS.ACCOUNTING_CONTACTS_MANAGE)) redirect("/app/accounting/contacts?error=forbidden");
  const parsedId = parseWithSchema(cuid, clean(formData.get("contactId")));
  if (!parsedId.success) redirect("/app/accounting/contacts?error=invalid-input");
  const session = await getServerAuthSession();
  let status: string;
  try {
    status = (await recheckContactVatNumber(tenant.organizationId, session?.user?.id ?? null, parsedId.data)).status;
  } catch (error) {
    if (error instanceof VatCheckError) redirect("/app/accounting/contacts?error=vat-check");
    throw error;
  }
  revalidatePath("/app/accounting/contacts");
  redirect(`/app/accounting/contacts?saved=1&vat=${status.toLowerCase()}`);
}

const CONTACT_TYPES = new Set(["CUSTOMER", "SUPPLIER", "BOTH"]);
const MAX_CONTACTS_CSV_BYTES = 1 * 1024 * 1024;

export async function importContactsCsvAction(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("accounting");
  if (!hasPermission(tenant, PERMISSIONS.ACCOUNTING_CONTACTS_MANAGE)) {
    redirect("/app/accounting/contacts?error=forbidden");
  }

  const file = formData.get("file");
  if (!(file instanceof File) || !file.size) redirect("/app/accounting/contacts?error=missing-file");
  if (file.size > MAX_CONTACTS_CSV_BYTES) redirect("/app/accounting/contacts?error=file-too-large");

  const session = await getServerAuthSession();
  let importedCount = 0;
  let skippedCount = 0;
  try {
    const content = await file.text();
    const { headers, rows } = parseCsv(content);
    const nameCol = findColumn(headers, ["name", "contact name"]);
    const typeCol = findColumn(headers, ["type", "contact type"]);
    const emailCol = findColumn(headers, ["email"]);
    const phoneCol = findColumn(headers, ["phone", "phone number"]);
    const addressCol = findColumn(headers, ["address"]);
    const tinCol = findColumn(headers, ["tin", "tax identification number", "taxid"]);
    if (!nameCol) redirect("/app/accounting/contacts?error=unrecognized-columns");

    const { imported, errors } = mapCsvRows(rows, (row) => {
      const name = row[nameCol!]?.trim();
      if (!name) throw new Error("Name is required.");
      const typeRaw = typeCol ? row[typeCol]?.trim().toUpperCase() : "CUSTOMER";
      const type = typeRaw && CONTACT_TYPES.has(typeRaw) ? (typeRaw as "CUSTOMER" | "SUPPLIER" | "BOTH") : "CUSTOMER";
      return {
        name,
        type,
        email: emailCol ? row[emailCol]?.trim() || null : null,
        phone: phoneCol ? row[phoneCol]?.trim() || null : null,
        address: addressCol ? row[addressCol]?.trim() || null : null,
        taxIdentificationNumber: tinCol ? row[tinCol]?.trim() || null : null,
      };
    });
    if (imported.length === 0) redirect("/app/accounting/contacts?error=no-valid-rows");

    const result = await importContactsFromCsv(tenant.organizationId, imported, session?.user?.id ?? null);
    importedCount = result.importedCount;
    skippedCount = result.skippedCount + errors.length;
  } catch (error) {
    if (error instanceof CsvParseError) redirect("/app/accounting/contacts?error=invalid-csv");
    throw error;
  }

  revalidatePath("/app/accounting/contacts");
  redirect(`/app/accounting/contacts?saved=1&imported=${importedCount}&skipped=${skippedCount}`);
}
