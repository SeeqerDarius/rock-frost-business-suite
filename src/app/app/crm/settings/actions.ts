"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { createLeadSource } from "@/modules/crm/service";
import { shortText, parseWithSchema } from "@/lib/validation";

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

export async function addLeadSource(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("crm");
  if (!hasPermission(tenant, PERMISSIONS.CRM_SETTINGS_MANAGE)) {
    redirect("/app/crm/settings?error=forbidden");
  }

  const parsed = parseWithSchema(shortText, clean(formData.get("name")));
  if (!parsed.success) {
    redirect("/app/crm/settings?error=missing-fields");
  }
  const name = parsed.data;

  await createLeadSource(tenant.organizationId, name);
  revalidatePath("/app/crm/settings");
  revalidatePath("/app/crm/leads");
  redirect("/app/crm/settings?saved=1");
}
