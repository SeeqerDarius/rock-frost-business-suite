"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { createWarehouse, updateWarehouse, WarehouseNameTakenError } from "@/modules/inventory/service";
import { shortText, parseWithSchema } from "@/lib/validation";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

const warehouseSchema = z.object({
  name: shortText,
  location: shortText.nullable(),
});

export async function upsertWarehouse(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("inventory");
  if (!hasPermission(tenant, PERMISSIONS.INVENTORY_WAREHOUSES_MANAGE)) {
    redirect("/app/inventory/warehouses?error=forbidden");
  }

  const id = clean(formData.get("id"));
  const parsed = parseWithSchema(warehouseSchema, {
    name: clean(formData.get("name")) ?? "",
    location: clean(formData.get("location")),
  });
  if (!parsed.success) {
    redirect("/app/inventory/warehouses?error=missing-fields");
  }

  const data = {
    name: parsed.data.name,
    location: parsed.data.location,
    isDefault: formData.get("isDefault") === "on",
    active: formData.get("active") === "on",
  };

  try {
    if (id) {
      await updateWarehouse(tenant.organizationId, id, data);
    } else {
      await createWarehouse(tenant.organizationId, data);
    }
  } catch (error) {
    if (error instanceof WarehouseNameTakenError) redirect("/app/inventory/warehouses?error=duplicate");
    throw error;
  }

  revalidatePath("/app/inventory/warehouses");
  redirect("/app/inventory/warehouses?saved=1");
}
