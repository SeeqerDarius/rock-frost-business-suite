"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { createContact, updateContact, NotFoundError } from "@/modules/crm/service";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

export async function upsertContact(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.CRM_CONTACTS_MANAGE)) {
    redirect("/app/crm/contacts?error=forbidden");
  }

  const id = clean(formData.get("id"));
  const fullName = clean(formData.get("fullName"));
  if (!fullName) {
    redirect("/app/crm/contacts?error=missing-fields");
  }

  const data = {
    fullName,
    company: clean(formData.get("company")),
    email: clean(formData.get("email")),
    phone: clean(formData.get("phone")),
    jobTitle: clean(formData.get("jobTitle")),
    notes: clean(formData.get("notes")),
    ownerId: clean(formData.get("ownerId")),
  };

  try {
    if (id) {
      await updateContact(tenant.organizationId, id, data);
    } else {
      await createContact(tenant.organizationId, data);
    }
  } catch (error) {
    if (error instanceof NotFoundError) redirect("/app/crm/contacts?error=not-found");
    throw error;
  }

  revalidatePath("/app/crm/contacts");
  redirect("/app/crm/contacts?saved=1");
}
