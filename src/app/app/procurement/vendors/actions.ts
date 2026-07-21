"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { createVendor, updateVendor } from "@/modules/procurement/service";
import { shortText, email as emailSchema, cuid, parseWithSchema } from "@/lib/validation";

function clean(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim();
}

/** Wraps a schema so an empty form field (missing/blank input) parses to null instead of failing validation. */
function optional<T extends z.ZodTypeAny>(schema: T) {
  return z.union([schema, z.literal("")]).transform((value) => (value === "" ? null : value));
}

const idSchema = z.object({ id: cuid });

const vendorSchema = z.object({
  name: shortText,
  contactName: optional(shortText),
  email: optional(emailSchema),
  phone: optional(shortText),
  address: optional(shortText),
});

export async function upsertVendor(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.PROCUREMENT_VENDORS_MANAGE)) {
    redirect("/app/procurement/vendors?error=forbidden");
  }

  const rawId = clean(formData.get("id"));
  const idResult = rawId ? parseWithSchema(idSchema, { id: rawId }) : null;
  const id = idResult && idResult.success ? idResult.data.id : null;

  const parsed = parseWithSchema(vendorSchema, {
    name: clean(formData.get("name")),
    contactName: clean(formData.get("contactName")),
    email: clean(formData.get("email")),
    phone: clean(formData.get("phone")),
    address: clean(formData.get("address")),
  });
  if (!parsed.success) {
    redirect("/app/procurement/vendors?error=missing-fields");
  }
  const { name, contactName, email, phone, address } = parsed.data;

  const data = { name, contactName, email, phone, address, active: formData.get("active") === "on" };

  if (id) {
    await updateVendor(tenant.organizationId, id, data);
  } else {
    await createVendor(tenant.organizationId, data);
  }

  revalidatePath("/app/procurement/vendors");
  redirect("/app/procurement/vendors?saved=1");
}
