"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { createFleetVehicleDocument, updateFleetVehicleDocument, NotFoundError } from "@/modules/fleet/service";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

export async function upsertFleetVehicleDocument(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.FLEET_INSURANCE_MANAGE)) {
    redirect("/app/fleet/insurance-roadworthy?error=forbidden");
  }

  const id = clean(formData.get("id"));
  const vehicleId = clean(formData.get("vehicleId"));
  const provider = clean(formData.get("provider"));
  const policyNumber = clean(formData.get("policyNumber"));
  const insuranceExpiresAt = clean(formData.get("insuranceExpiresAt"));
  const roadworthyExpiresAt = clean(formData.get("roadworthyExpiresAt"));

  if (!vehicleId || !provider || !policyNumber || !insuranceExpiresAt || !roadworthyExpiresAt) {
    redirect("/app/fleet/insurance-roadworthy?error=missing-fields");
  }

  const data = {
    vehicleId,
    provider,
    policyNumber,
    insuranceExpiresAt: new Date(insuranceExpiresAt),
    roadworthyExpiresAt: new Date(roadworthyExpiresAt),
    alerts: clean(formData.get("alerts")),
  };

  try {
    if (id) {
      await updateFleetVehicleDocument(tenant.organizationId, id, data);
    } else {
      await createFleetVehicleDocument(tenant.organizationId, data);
    }
  } catch (error) {
    if (error instanceof NotFoundError) redirect("/app/fleet/insurance-roadworthy?error=not-found");
    throw error;
  }

  revalidatePath("/app/fleet/insurance-roadworthy");
  redirect("/app/fleet/insurance-roadworthy?saved=1");
}
