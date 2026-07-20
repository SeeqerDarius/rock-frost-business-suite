"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { setDefaultWarehouse } from "@/modules/procurement/service";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

export async function updateDefaultWarehouse(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.PROCUREMENT_SETTINGS_MANAGE)) {
    redirect("/app/procurement/settings?error=forbidden");
  }

  await setDefaultWarehouse(tenant.organizationId, clean(formData.get("defaultWarehouseId")));
  revalidatePath("/app/procurement/settings");
  redirect("/app/procurement/settings?saved=1");
}
