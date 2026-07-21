"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { createLead, updateLead, convertLeadToDeal, LeadAlreadyConvertedError, NotFoundError } from "@/modules/crm/service";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

export async function upsertLead(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.CRM_LEADS_MANAGE)) {
    redirect("/app/crm/leads?error=forbidden");
  }

  const id = clean(formData.get("id"));
  const fullName = clean(formData.get("fullName"));
  if (!fullName) {
    redirect("/app/crm/leads?error=missing-fields");
  }

  const data = {
    fullName,
    company: clean(formData.get("company")),
    email: clean(formData.get("email")),
    phone: clean(formData.get("phone")),
    source: clean(formData.get("source")),
    notes: clean(formData.get("notes")),
    ownerId: clean(formData.get("ownerId")),
  };

  try {
    if (id) {
      await updateLead(tenant.organizationId, id, data);
    } else {
      await createLead(tenant.organizationId, data);
    }
  } catch (error) {
    if (error instanceof NotFoundError) redirect("/app/crm/leads?error=not-found");
    throw error;
  }

  revalidatePath("/app/crm/leads");
  redirect("/app/crm/leads?saved=1");
}

export async function convertLead(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.CRM_LEADS_MANAGE) || !hasPermission(tenant, PERMISSIONS.CRM_DEALS_MANAGE)) {
    redirect("/app/crm/leads?error=forbidden");
  }

  const leadId = clean(formData.get("leadId"));
  const title = clean(formData.get("title"));
  const value = clean(formData.get("value")) ?? "0";
  if (!leadId || !title) {
    redirect("/app/crm/leads?error=missing-fields");
  }

  try {
    await convertLeadToDeal(tenant.organizationId, leadId, { title, value });
  } catch (error) {
    if (error instanceof LeadAlreadyConvertedError) {
      redirect("/app/crm/leads?error=already-converted");
    }
    throw error;
  }

  revalidatePath("/app/crm/leads");
  revalidatePath("/app/crm/deals");
  revalidatePath("/app/crm/contacts");
  redirect("/app/crm/deals?saved=1");
}
