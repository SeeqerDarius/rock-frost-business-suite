"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { createCustomer, updateCustomer, NotFoundError } from "@/modules/installment/service";
import { shortText, longText, parseWithSchema } from "@/lib/validation";
import { z } from "zod";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

const customerSchema = z.object({
  fullName: shortText,
  staffId: shortText,
  phone: longText.optional(),
  address: longText.optional(),
  nationalId: longText.optional(),
});

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

  const parsed = parseWithSchema(customerSchema, {
    fullName,
    staffId,
    phone: clean(formData.get("phone")) ?? undefined,
    address: clean(formData.get("address")) ?? undefined,
    nationalId: clean(formData.get("nationalId")) ?? undefined,
  });
  if (!parsed.success) {
    redirect("/app/installment/customers?error=invalid-input");
  }

  const data = {
    fullName: parsed.data.fullName,
    staffId: parsed.data.staffId,
    phone: parsed.data.phone ?? null,
    address: parsed.data.address ?? null,
    nationalId: parsed.data.nationalId ?? null,
  };

  try {
    if (id) {
      await updateCustomer(tenant.organizationId, id, data);
    } else {
      await createCustomer(tenant.organizationId, data);
    }
  } catch (error) {
    if (error instanceof NotFoundError) redirect("/app/installment/customers?error=not-found");
    throw error;
  }

  revalidatePath("/app/installment/customers");
  redirect("/app/installment/customers?saved=1");
}
