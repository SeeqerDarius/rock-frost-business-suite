"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { createFleetOwner, updateFleetOwner } from "@/modules/fleet/service";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

export async function upsertFleetOwner(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.FLEET_OWNERS_MANAGE)) {
    redirect("/app/fleet/owners?error=forbidden");
  }

  const id = clean(formData.get("id"));
  const name = clean(formData.get("name"));
  if (!name) {
    redirect("/app/fleet/owners?error=missing-fields");
  }

  const data = {
    name,
    businessName: clean(formData.get("businessName")),
    phone: clean(formData.get("phone")),
    email: clean(formData.get("email")),
  };

  if (id) {
    await updateFleetOwner(tenant.organizationId, id, data);
  } else {
    await createFleetOwner(tenant.organizationId, data);
  }

  revalidatePath("/app/fleet/owners");
  redirect("/app/fleet/owners?saved=1");
}
