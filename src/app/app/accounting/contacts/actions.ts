"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import { createContact, updateContact, NotFoundError } from "@/modules/accounting/service";
import { shortText, longText, optionalEmail, optionalLongText, cuid, parseWithSchema } from "@/lib/validation";

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
