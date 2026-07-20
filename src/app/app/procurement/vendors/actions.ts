"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { createVendor, updateVendor } from "@/modules/procurement/service";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

export async function upsertVendor(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.PROCUREMENT_VENDORS_MANAGE)) {
    redirect("/app/procurement/vendors?error=forbidden");
  }

  const id = clean(formData.get("id"));
  const name = clean(formData.get("name"));
  if (!name) {
    redirect("/app/procurement/vendors?error=missing-fields");
  }

  const data = {
    name,
    contactName: clean(formData.get("contactName")),
    email: clean(formData.get("email")),
    phone: clean(formData.get("phone")),
    address: clean(formData.get("address")),
    active: formData.get("active") === "on",
  };

  if (id) {
    await updateVendor(tenant.organizationId, id, data);
  } else {
    await createVendor(tenant.organizationId, data);
  }

  revalidatePath("/app/procurement/vendors");
  redirect("/app/procurement/vendors?saved=1");
}
