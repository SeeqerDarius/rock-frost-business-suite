"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { createLeadSource } from "@/modules/crm/service";

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

export async function addLeadSource(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.CRM_SETTINGS_MANAGE)) {
    redirect("/app/crm/settings?error=forbidden");
  }

  const name = clean(formData.get("name"));
  if (!name) {
    redirect("/app/crm/settings?error=missing-fields");
  }

  await createLeadSource(tenant.organizationId, name);
  revalidatePath("/app/crm/settings");
  revalidatePath("/app/crm/leads");
  redirect("/app/crm/settings?saved=1");
}
