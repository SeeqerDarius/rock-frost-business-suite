"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { createItem, updateItem, ItemSkuTakenError, NotFoundError } from "@/modules/inventory/service";
import { shortText, moneyAmount, cuid, parseWithSchema } from "@/lib/validation";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

/** A reorder threshold quantity — `positiveInt` doesn't fit since 0 (no reorder alert) is valid. */
const nonNegativeInt = z.coerce.number().int().min(0);

const itemSchema = z.object({
  sku: shortText,
  name: shortText,
  categoryId: cuid.nullable(),
  unit: shortText,
  costPrice: moneyAmount,
  reorderPoint: nonNegativeInt,
});

export async function upsertItem(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.INVENTORY_ITEMS_MANAGE)) {
    redirect("/app/inventory/items?error=forbidden");
  }

  const id = clean(formData.get("id"));
  const parsed = parseWithSchema(itemSchema, {
    sku: clean(formData.get("sku")) ?? "",
    name: clean(formData.get("name")) ?? "",
    categoryId: clean(formData.get("categoryId")),
    unit: clean(formData.get("unit")) ?? "unit",
    costPrice: clean(formData.get("costPrice")) ?? "",
    reorderPoint: clean(formData.get("reorderPoint")) ?? "0",
  });
  if (!parsed.success) {
    redirect("/app/inventory/items?error=missing-fields");
  }

  const data = {
    sku: parsed.data.sku,
    name: parsed.data.name,
    categoryId: parsed.data.categoryId,
    unit: parsed.data.unit,
    costPrice: parsed.data.costPrice,
    reorderPoint: parsed.data.reorderPoint,
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
    if (error instanceof NotFoundError) {
      redirect("/app/inventory/items?error=not-found");
    }
    throw error;
  }

  revalidatePath("/app/inventory/items");
  redirect("/app/inventory/items?saved=1");
}
