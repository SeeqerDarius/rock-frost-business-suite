"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { createCustomer, updateCustomer } from "@/modules/installment/service";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

export async function upsertCustomer(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.HIREPURCHASE_CUSTOMERS_MANAGE)) {
    redirect("/app/installment/customers?error=forbidden");
  }

  const id = clean(formData.get("id"));
  const fullName = clean(formData.get("fullName"));
  const staffId = clean(formData.get("staffId"));
  if (!fullName || !staffId) {
    redirect("/app/installment/customers?error=missing-fields");
  }

  const data = {
    fullName,
    staffId,
    phone: clean(formData.get("phone")),
    address: clean(formData.get("address")),
    nationalId: clean(formData.get("nationalId")),
  };

  if (id) {
    await updateCustomer(tenant.organizationId, id, data);
  } else {
    await createCustomer(tenant.organizationId, data);
  }

  revalidatePath("/app/installment/customers");
  redirect("/app/installment/customers?saved=1");
}
