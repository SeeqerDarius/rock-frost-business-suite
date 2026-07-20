"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { createItem, updateItem, ItemSkuTakenError } from "@/modules/inventory/service";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

export async function upsertItem(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.INVENTORY_ITEMS_MANAGE)) {
    redirect("/app/inventory/items?error=forbidden");
  }

  const id = clean(formData.get("id"));
  const sku = clean(formData.get("sku"));
  const name = clean(formData.get("name"));
  const costPrice = clean(formData.get("costPrice"));

  if (!sku || !name || !costPrice) {
    redirect("/app/inventory/items?error=missing-fields");
  }

  const data = {
    sku,
    name,
    categoryId: clean(formData.get("categoryId")),
    unit: clean(formData.get("unit")) ?? "unit",
    costPrice,
    reorderPoint: Number.parseInt(clean(formData.get("reorderPoint")) ?? "0", 10),
    active: formData.get("active") === "on",
  };

  try {
    if (id) {
      await updateItem(tenant.organizationId, id, data);
    } else {
      await createItem(tenant.organizationId, data);
    }
  } catch (error) {
    if (error instanceof ItemSkuTakenError) {
      redirect("/app/inventory/items?error=sku-taken");
    }
    throw error;
  }

  revalidatePath("/app/inventory/items");
  redirect("/app/inventory/items?saved=1");
}
