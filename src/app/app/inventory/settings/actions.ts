"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { createCategory, updateInventorySettings } from "@/modules/inventory/service";
import { shortText, parseWithSchema } from "@/lib/validation";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

export async function addCategory(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("inventory");
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

const reorderPointSchema = z.object({ defaultReorderPoint: z.coerce.number().int().min(0).max(1000000) });

export async function saveInventorySettings(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("inventory");
  if (!hasPermission(tenant, PERMISSIONS.INVENTORY_SETTINGS_MANAGE)) {
    redirect("/app/inventory/settings?error=forbidden");
  }

  const parsed = parseWithSchema(reorderPointSchema, { defaultReorderPoint: clean(formData.get("defaultReorderPoint")) ?? "0" });
  if (!parsed.success) redirect("/app/inventory/settings?error=invalid-reorder-point");

  await updateInventorySettings(tenant.organizationId, parsed.data, tenant.userId);
  revalidatePath("/app/inventory/settings");
  revalidatePath("/app/inventory/items");
  redirect("/app/inventory/settings?saved=1");
}
