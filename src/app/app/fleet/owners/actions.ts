"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { createFleetOwner, updateFleetOwner } from "@/modules/fleet/service";
import { shortText, longText, email as emailSchema, parseWithSchema } from "@/lib/validation";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

const ownerSchema = z.object({
  name: shortText,
  businessName: longText.optional(),
  phone: longText.optional(),
  email: emailSchema.optional(),
});

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

  const parsed = parseWithSchema(ownerSchema, {
    name,
    businessName: clean(formData.get("businessName")) ?? undefined,
    phone: clean(formData.get("phone")) ?? undefined,
    email: clean(formData.get("email")) ?? undefined,
  });
  if (!parsed.success) {
    redirect("/app/fleet/owners?error=invalid-input");
  }

  const data = {
    name: parsed.data.name,
    businessName: parsed.data.businessName ?? null,
    phone: parsed.data.phone ?? null,
    email: parsed.data.email ?? null,
  };

  if (id) {
    await updateFleetOwner(tenant.organizationId, id, data);
  } else {
    await createFleetOwner(tenant.organizationId, data);
  }

  revalidatePath("/app/fleet/owners");
  redirect("/app/fleet/owners?saved=1");
}
