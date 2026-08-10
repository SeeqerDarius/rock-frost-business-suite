"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { createLeadSource, updateCrmSettings } from "@/modules/crm/service";
import { cuid, shortText, parseWithSchema } from "@/lib/validation";

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

const defaultOwnerSchema = z.object({ defaultOwnerId: z.union([cuid, z.literal("")]) });

export async function saveCrmSettings(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("crm");
  if (!hasPermission(tenant, PERMISSIONS.CRM_SETTINGS_MANAGE)) {
    redirect("/app/crm/settings?error=forbidden");
  }

  const parsed = parseWithSchema(defaultOwnerSchema, { defaultOwnerId: clean(formData.get("defaultOwnerId")) });
  if (!parsed.success) redirect("/app/crm/settings?error=invalid-owner");

  try {
    await updateCrmSettings(tenant.organizationId, { defaultOwnerId: parsed.data.defaultOwnerId || null }, tenant.userId);
  } catch {
    redirect("/app/crm/settings?error=invalid-owner");
  }

  revalidatePath("/app/crm/settings");
  revalidatePath("/app/crm/leads");
  revalidatePath("/app/crm/deals");
  redirect("/app/crm/settings?saved=1");
}
