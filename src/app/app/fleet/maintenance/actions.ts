"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import { createFleetMaintenanceRequest, updateFleetMaintenanceRequest, NotFoundError } from "@/modules/fleet/service";
import type { FleetMaintenanceApprovalStatus, FleetMaintenanceProgressStatus } from "@prisma/client";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

export async function createMaintenanceRequest(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("fleet");
  if (!hasPermission(tenant, PERMISSIONS.FLEET_MAINTENANCE_MANAGE)) {
    redirect("/app/fleet/maintenance?error=forbidden");
  }

  const vehicleId = clean(formData.get("vehicleId"));
  const faultDescription = clean(formData.get("faultDescription"));
  if (!vehicleId || !faultDescription) {
    redirect("/app/fleet/maintenance?error=missing-fields");
  }

  const session = await getServerAuthSession();
  try {
    await createFleetMaintenanceRequest(tenant.organizationId, {
      vehicleId,
      faultDescription,
      requestedById: session?.user?.id ?? null,
    });
  } catch (error) {
    if (error instanceof NotFoundError) redirect("/app/fleet/maintenance?error=not-found");
    throw error;
  }

  revalidatePath("/app/fleet/maintenance");
  redirect("/app/fleet/maintenance?saved=1");
}

/**
 * Fleet-manager/mechanic-side review of a request. Owner approval
 * (ownerApprovalStatus) is intentionally left untouched here — owners are a
 * separate FleetOwner record with no login/session concept in this schema,
 * so an owner-facing approval portal is out of scope for this pass.
 */
export async function reviewMaintenanceRequest(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("fleet");
  if (!hasPermission(tenant, PERMISSIONS.FLEET_MAINTENANCE_MANAGE)) {
    redirect("/app/fleet/maintenance?error=forbidden");
  }

  const id = clean(formData.get("id"));
  if (!id) {
    redirect("/app/fleet/maintenance?error=missing-fields");
  }

  const progressStatus = clean(formData.get("progressStatus")) as FleetMaintenanceProgressStatus | null;
  const approvalStatus = clean(formData.get("approvalStatus")) as FleetMaintenanceApprovalStatus | null;
  const repairCostRaw = clean(formData.get("repairCost"));

  await updateFleetMaintenanceRequest(tenant.organizationId, id, {
    approvalStatus: approvalStatus ?? undefined,
    fleetManagerReview: clean(formData.get("fleetManagerReview")),
    mechanicAssigned: clean(formData.get("mechanicAssigned")),
    progressStatus: progressStatus ?? undefined,
    repairCost: repairCostRaw,
    completionVerified: formData.get("completionVerified") === "on",
    completedAt: progressStatus === "COMPLETED" ? new Date() : undefined,
  });

  revalidatePath("/app/fleet/maintenance");
  redirect("/app/fleet/maintenance?saved=1");
}
