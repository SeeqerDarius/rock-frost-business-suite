"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { createWarehouse, updateWarehouse } from "@/modules/inventory/service";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

export async function upsertWarehouse(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.INVENTORY_WAREHOUSES_MANAGE)) {
    redirect("/app/inventory/warehouses?error=forbidden");
  }

  const id = clean(formData.get("id"));
  const name = clean(formData.get("name"));
  if (!name) {
    redirect("/app/inventory/warehouses?error=missing-fields");
  }

  const data = {
    name,
    location: clean(formData.get("location")),
    isDefault: formData.get("isDefault") === "on",
    active: formData.get("active") === "on",
  };

  if (id) {
    await updateWarehouse(tenant.organizationId, id, data);
  } else {
    await createWarehouse(tenant.organizationId, data);
  }

  revalidatePath("/app/inventory/warehouses");
  redirect("/app/inventory/warehouses?saved=1");
}
