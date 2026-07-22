"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { createFleetDriver, updateFleetDriver } from "@/modules/fleet/service";
import { shortText, longText, email as emailSchema, dateInput, parseWithSchema } from "@/lib/validation";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

const driverStatusSchema = z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]);

const driverSchema = z.object({
  name: shortText,
  licenceNumber: longText.optional(),
  licenceExpiry: dateInput.optional(),
  phone: longText.optional(),
  email: emailSchema.optional(),
  status: driverStatusSchema.optional(),
  employmentStartDate: dateInput.optional(),
});

export async function upsertFleetDriver(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("fleet");
  if (!hasPermission(tenant, PERMISSIONS.FLEET_DRIVERS_MANAGE)) {
    redirect("/app/fleet/drivers?error=forbidden");
  }

  const id = clean(formData.get("id"));
  const name = clean(formData.get("name"));
  if (!name) {
    redirect("/app/fleet/drivers?error=missing-fields");
  }

  const parsed = parseWithSchema(driverSchema, {
    name,
    licenceNumber: clean(formData.get("licenceNumber")) ?? undefined,
    licenceExpiry: clean(formData.get("licenceExpiry")) ?? undefined,
    phone: clean(formData.get("phone")) ?? undefined,
    email: clean(formData.get("email")) ?? undefined,
    status: clean(formData.get("status")) ?? undefined,
    employmentStartDate: clean(formData.get("employmentStartDate")) ?? undefined,
  });
  if (!parsed.success) {
    redirect("/app/fleet/drivers?error=invalid-input");
  }

  const data = {
    name: parsed.data.name,
    licenceNumber: parsed.data.licenceNumber ?? null,
    licenceExpiry: parsed.data.licenceExpiry ?? null,
    phone: parsed.data.phone ?? null,
    email: parsed.data.email ?? null,
    status: parsed.data.status ?? "ACTIVE",
    employmentStartDate: parsed.data.employmentStartDate ?? null,
  };

  if (id) {
    await updateFleetDriver(tenant.organizationId, id, data);
  } else {
    await createFleetDriver(tenant.organizationId, data);
  }

  revalidatePath("/app/fleet/drivers");
  redirect("/app/fleet/drivers?saved=1");
}
