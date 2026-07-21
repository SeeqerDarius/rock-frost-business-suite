"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { createCategory } from "@/modules/inventory/service";
import { shortText, parseWithSchema } from "@/lib/validation";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

export async function addCategory(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.INVENTORY_SETTINGS_MANAGE)) {
    redirect("/app/inventory/settings?error=forbidden");
  }

  const parsed = parseWithSchema(shortText, clean(formData.get("name")) ?? "");
  if (!parsed.success) {
    redirect("/app/inventory/settings?error=missing-fields");
  }
  const name = parsed.data;

  await createCategory(tenant.organizationId, name);
  revalidatePath("/app/inventory/settings");
  revalidatePath("/app/inventory/items");
  redirect("/app/inventory/settings?saved=1");
}
