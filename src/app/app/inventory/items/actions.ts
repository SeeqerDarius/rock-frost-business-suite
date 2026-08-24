"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { createItem, updateItem, ItemBarcodeTakenError, ItemSkuTakenError, NotFoundError } from "@/modules/inventory/service";
import { shortText, moneyAmount, cuid, parseWithSchema } from "@/lib/validation";
import { inventoryItemImageData } from "@/lib/inventory-item-image";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

/** A reorder threshold quantity — `positiveInt` doesn't fit since 0 (no reorder alert) is valid. */
const nonNegativeInt = z.coerce.number().int().min(0);

const itemSchema = z.object({
  sku: shortText,
  barcode: shortText.nullable().optional(),
  name: shortText,
  categoryId: cuid.nullable(),
  taxCodeId: cuid.nullable(),
  unit: shortText,
  costPrice: moneyAmount,
  salesPrice: moneyAmount,
  productType: z.enum(["GOODS", "SERVICE"]),
  reorderPoint: nonNegativeInt,
});

export async function upsertItem(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("inventory");
  if (!hasPermission(tenant, PERMISSIONS.INVENTORY_ITEMS_MANAGE)) {
    redirect("/app/inventory/items?error=forbidden");
  }

  const id = clean(formData.get("id"));
  const imageFile = formData.get("image");
  const parsed = parseWithSchema(itemSchema, {
    sku: clean(formData.get("sku")) ?? "",
    barcode: clean(formData.get("barcode")),
    name: clean(formData.get("name")) ?? "",
    categoryId: clean(formData.get("categoryId")),
    taxCodeId: clean(formData.get("taxCodeId")),
    unit: clean(formData.get("unit")) ?? "unit",
    costPrice: clean(formData.get("costPrice")) ?? "",
    salesPrice: clean(formData.get("salesPrice")) ?? "0",
    productType: clean(formData.get("productType")) ?? "GOODS",
    reorderPoint: clean(formData.get("reorderPoint")) ?? "0",
  });
  if (!parsed.success) {
    redirect("/app/inventory/items?error=missing-fields");
  }

  let imageData: string | null | undefined;
  try {
    imageData = imageFile instanceof File ? await inventoryItemImageData(imageFile) ?? undefined : undefined;
  } catch {
    redirect("/app/inventory/items?error=invalid-image");
  }
  if (id && formData.get("removeImage") === "on" && !imageData) imageData = null;

  const data = {
    sku: parsed.data.sku,
    barcode: parsed.data.barcode ?? null,
    name: parsed.data.name,
    categoryId: parsed.data.categoryId,
    taxCodeId: parsed.data.taxCodeId,
    unit: parsed.data.unit,
    costPrice: parsed.data.costPrice,
    salesPrice: parsed.data.salesPrice,
    productType: parsed.data.productType,
    trackInventory: formData.get("trackInventory") === "on",
    isPosAvailable: formData.get("isPosAvailable") === "on",
    isPurchasable: formData.get("isPurchasable") === "on",
    reorderPoint: parsed.data.reorderPoint,
    active: formData.get("active") === "on",
    ...(imageData !== undefined ? { imageData } : {}),
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
    if (error instanceof ItemBarcodeTakenError) redirect("/app/inventory/items?error=barcode-taken");
    if (error instanceof NotFoundError) {
      redirect("/app/inventory/items?error=not-found");
    }
    throw error;
  }

  revalidatePath("/app/inventory/items");
  redirect("/app/inventory/items?saved=1");
}
