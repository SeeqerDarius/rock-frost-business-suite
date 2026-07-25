"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import {
  createFleetMaintenanceRequest,
  managerReviewMaintenanceRequest,
  ownerDecisionMaintenanceRequest,
  assignMaintenanceMechanic,
  startMaintenanceRepair,
  completeMaintenanceRepair,
  verifyMaintenanceCompletion,
  NotFoundError,
  InvalidMaintenanceTransitionError,
  MaintenanceApprovalRequiredError,
  InvalidPaymentAmountError,
  canUserReportFleetVehicle,
} from "@/modules/fleet/service";
import { logAuditEvent } from "@/lib/audit";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

export async function createMaintenanceRequest(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("fleet");
  if (
    !hasPermission(tenant, PERMISSIONS.FLEET_MAINTENANCE_MANAGE) &&
    !hasPermission(tenant, PERMISSIONS.FLEET_VIEW)
  ) {
    redirect("/app/fleet/maintenance?error=forbidden");
  }

  const vehicleId = clean(formData.get("vehicleId"));
  const faultDescription = clean(formData.get("faultDescription"));
  if (!vehicleId || !faultDescription) {
    redirect("/app/fleet/maintenance?error=missing-fields");
  }

  const session = await getServerAuthSession();
  if (!session?.user?.id) redirect("/login");
  if (
    !hasPermission(tenant, PERMISSIONS.FLEET_MAINTENANCE_MANAGE) &&
    !(await canUserReportFleetVehicle(tenant.organizationId, vehicleId, session.user.id))
  ) {
    redirect("/app/fleet/maintenance?error=not-found");
  }
  try {
    await createFleetMaintenanceRequest(tenant.organizationId, {
      vehicleId,
      faultDescription,
      requestedById: session.user.id,
      ownerApprovalRequired: formData.get("ownerApprovalRequired") === "on",
    });
  } catch (error) {
    if (error instanceof NotFoundError) redirect("/app/fleet/maintenance?error=not-found");
    throw error;
  }

  revalidatePath("/app/fleet/maintenance");
  redirect("/app/fleet/maintenance?saved=1");
}

export async function reviewMaintenanceRequest(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("fleet");
  if (!hasPermission(tenant, PERMISSIONS.FLEET_MAINTENANCE_MANAGE)) {
    redirect("/app/fleet/maintenance?error=forbidden");
  }

  const id = clean(formData.get("id"));
  if (!id) {
    redirect("/app/fleet/maintenance?error=missing-fields");
  }

  const session = await getServerAuthSession();
  if (!session?.user?.id) redirect("/login");
  try {
    await managerReviewMaintenanceRequest(tenant.organizationId, id, session.user.id, {
      approved: formData.get("decision") === "approve",
      ownerApprovalRequired: formData.get("ownerApprovalRequired") === "on",
      fleetManagerReview: clean(formData.get("fleetManagerReview")),
    });
    await logAuditEvent({
      organizationId: tenant.organizationId, userId: session.user.id, module: "fleet",
      action: "fleet.maintenance.manager_reviewed", entityName: "FleetMaintenanceRequest", entityId: id,
      metadata: { decision: clean(formData.get("decision")), ownerApprovalRequired: formData.get("ownerApprovalRequired") === "on" },
    });
  } catch (error) {
    if (error instanceof InvalidMaintenanceTransitionError) redirect("/app/fleet/maintenance?error=invalid-transition");
    if (error instanceof NotFoundError) redirect("/app/fleet/maintenance?error=not-found");
    throw error;
  }

  revalidatePath("/app/fleet/maintenance");
  redirect("/app/fleet/maintenance?saved=1");
}

async function maintenanceContext(permission: string) {
  const tenant = await requireModuleAccess("fleet");
  if (!hasPermission(tenant, permission)) redirect("/app/fleet/maintenance?error=forbidden");
  const session = await getServerAuthSession();
  if (!session?.user?.id) redirect("/login");
  return { tenant, userId: session.user.id };
}

function workflowError(error: unknown): never {
  if (error instanceof InvalidMaintenanceTransitionError) redirect("/app/fleet/maintenance?error=invalid-transition");
  if (error instanceof MaintenanceApprovalRequiredError) redirect("/app/fleet/maintenance?error=approval-required");
  if (error instanceof InvalidPaymentAmountError) redirect("/app/fleet/maintenance?error=invalid-cost");
  if (error instanceof NotFoundError) redirect("/app/fleet/maintenance?error=not-found");
  throw error;
}

export async function ownerMaintenanceDecision(formData: FormData): Promise<void> {
  const { tenant, userId } = await maintenanceContext(PERMISSIONS.FLEET_INVESTOR_VIEW);
  const id = clean(formData.get("id"));
  if (!id) redirect("/app/fleet/maintenance?error=missing-fields");
  try {
    await ownerDecisionMaintenanceRequest(tenant.organizationId, id, userId, formData.get("decision") === "approve", clean(formData.get("note")));
  } catch (error) { workflowError(error); }
  revalidatePath("/app/fleet/maintenance");
  revalidatePath("/app/fleet/investor");
  redirect("/app/fleet/maintenance?saved=1");
}

export async function assignMechanic(formData: FormData): Promise<void> {
  const { tenant, userId } = await maintenanceContext(PERMISSIONS.FLEET_MAINTENANCE_MANAGE);
  const id = clean(formData.get("id"));
  const mechanic = clean(formData.get("mechanicAssigned"));
  if (!id || !mechanic) redirect("/app/fleet/maintenance?error=missing-fields");
  try { await assignMaintenanceMechanic(tenant.organizationId, id, userId, mechanic); } catch (error) { workflowError(error); }
  revalidatePath("/app/fleet/maintenance");
  redirect("/app/fleet/maintenance?saved=1");
}

export async function startRepair(formData: FormData): Promise<void> {
  const { tenant, userId } = await maintenanceContext(PERMISSIONS.FLEET_MAINTENANCE_MANAGE);
  const id = clean(formData.get("id"));
  if (!id) redirect("/app/fleet/maintenance?error=missing-fields");
  try { await startMaintenanceRepair(tenant.organizationId, id, userId); } catch (error) { workflowError(error); }
  revalidatePath("/app/fleet/maintenance");
  revalidatePath("/app/fleet/vehicles");
  redirect("/app/fleet/maintenance?saved=1");
}

export async function completeRepair(formData: FormData): Promise<void> {
  const { tenant, userId } = await maintenanceContext(PERMISSIONS.FLEET_MAINTENANCE_MANAGE);
  const id = clean(formData.get("id"));
  const repairCost = clean(formData.get("repairCost"));
  if (!id || repairCost === null) redirect("/app/fleet/maintenance?error=missing-fields");
  try { await completeMaintenanceRepair(tenant.organizationId, id, userId, repairCost, clean(formData.get("note"))); } catch (error) { workflowError(error); }
  revalidatePath("/app/fleet/maintenance");
  redirect("/app/fleet/maintenance?saved=1");
}

export async function verifyRepairCompletion(formData: FormData): Promise<void> {
  const { tenant, userId } = await maintenanceContext(PERMISSIONS.FLEET_MAINTENANCE_MANAGE);
  const id = clean(formData.get("id"));
  if (!id) redirect("/app/fleet/maintenance?error=missing-fields");
  try {
    await verifyMaintenanceCompletion(tenant.organizationId, id, userId);
    await logAuditEvent({
      organizationId: tenant.organizationId, userId, module: "fleet",
      action: "fleet.maintenance.completion_verified", entityName: "FleetMaintenanceRequest", entityId: id,
    });
  } catch (error) { workflowError(error); }
  revalidatePath("/app/fleet/maintenance");
  revalidatePath("/app/fleet/vehicles");
  revalidatePath("/app/fleet/investor");
  redirect("/app/fleet/maintenance?saved=1");
}
