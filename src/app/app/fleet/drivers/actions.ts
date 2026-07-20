"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { createFleetDriver, updateFleetDriver } from "@/modules/fleet/service";
import type { FleetDriverStatus } from "@prisma/client";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

function cleanDate(value: FormDataEntryValue | null) {
  const str = clean(value);
  return str ? new Date(str) : null;
}

export async function upsertFleetDriver(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.FLEET_DRIVERS_MANAGE)) {
    redirect("/app/fleet/drivers?error=forbidden");
  }

  const id = clean(formData.get("id"));
  const name = clean(formData.get("name"));
  if (!name) {
    redirect("/app/fleet/drivers?error=missing-fields");
  }

  const data = {
    name,
    licenceNumber: clean(formData.get("licenceNumber")),
    licenceExpiry: cleanDate(formData.get("licenceExpiry")),
    phone: clean(formData.get("phone")),
    email: clean(formData.get("email")),
    status: (clean(formData.get("status")) as FleetDriverStatus) ?? "ACTIVE",
    employmentStartDate: cleanDate(formData.get("employmentStartDate")),
  };

  if (id) {
    await updateFleetDriver(tenant.organizationId, id, data);
  } else {
    await createFleetDriver(tenant.organizationId, data);
  }

  revalidatePath("/app/fleet/drivers");
  redirect("/app/fleet/drivers?saved=1");
}
