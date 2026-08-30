"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { createFleetMechanic, updateFleetMechanic } from "@/modules/fleet/service";
import { shortText, longText, email as emailSchema, parseWithSchema } from "@/lib/validation";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

const mechanicSchema = z.object({
  name: shortText,
  businessName: longText.optional(),
  phone: longText.optional(),
  email: emailSchema.optional(),
  location: longText.optional(),
  specialty: longText.optional(),
});

export async function upsertFleetMechanic(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("fleet");
  if (!hasPermission(tenant, PERMISSIONS.FLEET_MECHANICS_MANAGE)) {
    redirect("/app/fleet/mechanics?error=forbidden");
  }

  const id = clean(formData.get("id"));
  const name = clean(formData.get("name"));
  if (!name) {
    redirect("/app/fleet/mechanics?error=missing-fields");
  }

  const parsed = parseWithSchema(mechanicSchema, {
    name,
    businessName: clean(formData.get("businessName")) ?? undefined,
    phone: clean(formData.get("phone")) ?? undefined,
    email: clean(formData.get("email")) ?? undefined,
    location: clean(formData.get("location")) ?? undefined,
    specialty: clean(formData.get("specialty")) ?? undefined,
  });
  if (!parsed.success) {
    redirect("/app/fleet/mechanics?error=invalid-input");
  }

  const data = {
    name: parsed.data.name,
    businessName: parsed.data.businessName ?? null,
    phone: parsed.data.phone ?? null,
    email: parsed.data.email ?? null,
    location: parsed.data.location ?? null,
    specialty: parsed.data.specialty ?? null,
    userId: clean(formData.get("userId")),
  };

  if (id) {
    await updateFleetMechanic(tenant.organizationId, id, { ...data, status: clean(formData.get("status")) === "INACTIVE" ? "INACTIVE" : "ACTIVE" });
  } else {
    await createFleetMechanic(tenant.organizationId, data);
  }

  revalidatePath("/app/fleet/mechanics");
  redirect("/app/fleet/mechanics?saved=1");
}
