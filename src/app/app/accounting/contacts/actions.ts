"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import { createContact, updateContact, importContactsFromCsv, NotFoundError } from "@/modules/accounting/service";
import { shortText, longText, optionalEmail, optionalLongText, cuid, parseWithSchema } from "@/lib/validation";
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
  });
  if (!parsed.success) {
    redirect("/app/accounting/contacts?error=invalid-input");
  }

  const data = {
    type: parsed.data.type,
    name: parsed.data.name,
    email: parsed.data.email ?? null,
    phone: parsed.data.phone ?? null,
    address: parsed.data.address ?? null,
    taxIdentificationNumber: parsed.data.taxIdentificationNumber ?? null,
  };

  const session = await getServerAuthSession();
  try {
    if (id) {
      const parsedId = parseWithSchema(cuid, id);
      if (!parsedId.success) redirect("/app/accounting/contacts?error=invalid-input");
      await updateContact(tenant.organizationId, parsedId.data, data);
    } else {
      await createContact(tenant.organizationId, data, session?.user?.id ?? null);
    }
  } catch (error) {
    if (error instanceof NotFoundError) redirect("/app/accounting/contacts?error=not-found");
    throw error;
  }

  revalidatePath("/app/accounting/contacts");
  redirect("/app/accounting/contacts?saved=1");
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
