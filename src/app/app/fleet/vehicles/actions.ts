"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { createFleetVehicle, updateFleetVehicle, NotFoundError, FleetSalesTargetError } from "@/modules/fleet/service";
import type { FleetSalesTargetPeriod, FleetVehicleStatus } from "@prisma/client";
import { logAuditEvent } from "@/lib/audit";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

function cleanInt(value: FormDataEntryValue | null) {
  const str = clean(value);
  return str ? Number.parseInt(str, 10) : null;
}

export async function upsertFleetVehicle(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("fleet");
  if (!hasPermission(tenant, PERMISSIONS.FLEET_VEHICLES_MANAGE)) {
    redirect("/app/fleet/vehicles?error=forbidden");
  }

  const id = clean(formData.get("id"));
  const assetTag = clean(formData.get("assetTag"));
  const plateNumber = clean(formData.get("plateNumber"));
  if (!assetTag || !plateNumber) {
    redirect("/app/fleet/vehicles?error=missing-fields");
  }

  const data = {
    assetTag,
    plateNumber,
    type: clean(formData.get("type")),
    make: clean(formData.get("make")),
    model: clean(formData.get("model")),
    year: cleanInt(formData.get("year")),
    ownerId: clean(formData.get("ownerId")),
    assignedDriverId: clean(formData.get("assignedDriverId")),
    status: (clean(formData.get("status")) as FleetVehicleStatus) ?? "AVAILABLE",
    mileage: cleanInt(formData.get("mileage")),
    location: clean(formData.get("location")),
    salesTargetPeriod:
      clean(formData.get("salesTargetPeriod")) === "NONE"
        ? null
        : (clean(formData.get("salesTargetPeriod")) as FleetSalesTargetPeriod | null),
    salesTargetAmount: clean(formData.get("salesTargetAmount")),
  };

  try {
    const vehicle = id
      ? await updateFleetVehicle(tenant.organizationId, id, data, tenant.userId)
      : await createFleetVehicle(tenant.organizationId, data, tenant.userId);
    await logAuditEvent({
      organizationId: tenant.organizationId,
      userId: tenant.userId,
      module: "fleet",
      action: id ? "fleet.vehicle.updated" : "fleet.vehicle.created",
      entityName: "FleetVehicle",
      entityId: vehicle.id,
      metadata: { assignedDriverId: data.assignedDriverId, salesTargetPeriod: data.salesTargetPeriod },
    });
  } catch (error) {
    if (error instanceof NotFoundError) redirect("/app/fleet/vehicles?error=not-found");
    if (error instanceof FleetSalesTargetError) redirect("/app/fleet/vehicles?error=invalid-target");
    redirect("/app/fleet/vehicles?error=duplicate");
  }

  revalidatePath("/app/fleet/vehicles");
  redirect("/app/fleet/vehicles?saved=1");
}
