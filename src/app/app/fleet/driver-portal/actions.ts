"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import {
  submitFleetDriverPayment,
  createFleetMaintenanceRequest,
  MAX_FLEET_MAINTENANCE_ATTACHMENTS,
  canUserReportFleetVehicle,
  NotFoundError,
  InvalidPaymentAmountError,
  FleetDuplicateSubmissionError,
  FleetSalesTargetError,
  FleetPaymentEvidenceError,
  FleetPaymentDateError,
} from "@/modules/fleet/service";
import { logAuditEvent } from "@/lib/audit";
import type { FleetDriverSubmissionType } from "@prisma/client";
import { initializeFleetOperationalPayment, SettlementUnavailableError } from "@/lib/payments/operational";
import { fleetMaintenancePhotoData } from "@/lib/fleet-maintenance-photo";

const clean = (value: FormDataEntryValue | null) => String(value ?? "").trim() || null;

export async function submitDriverPayment(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("fleet");
  if (!hasPermission(tenant, PERMISSIONS.FLEET_DRIVER_SELF_SERVICE)) redirect("/app/fleet/driver-portal?error=forbidden");
  const session = await getServerAuthSession();
  if (!session?.user?.id) redirect("/login");
  const amount = clean(formData.get("amount"));
  const paymentDate = clean(formData.get("paymentDate"));
  const periodStart = clean(formData.get("periodStart"));
  const paymentMethod = clean(formData.get("paymentMethod"));
  const vehicleId = clean(formData.get("vehicleId"));
  const submissionType = clean(formData.get("submissionType"));
  if (!amount || !paymentDate || !periodStart || !paymentMethod || !vehicleId || !submissionType) {
    redirect("/app/fleet/driver-portal?error=missing-fields");
  }
  if (!["DAILY_SALES", "WEEKLY_SALES", "WORK_AND_PAY"].includes(submissionType)) {
    redirect("/app/fleet/driver-portal?error=invalid-type");
  }
  try {
    const submission = await submitFleetDriverPayment(tenant.organizationId, session.user.id, {
      vehicleId,
      contractId: clean(formData.get("contractId")),
      submissionType: submissionType as FleetDriverSubmissionType,
      periodStart: new Date(`${periodStart}T00:00:00.000Z`),
      amount,
      paymentDate: new Date(`${paymentDate}T00:00:00.000Z`), paymentMethod,
      reference: clean(formData.get("reference")), notes: clean(formData.get("notes")),
    });
    await logAuditEvent({ organizationId: tenant.organizationId, userId: session.user.id, module: "fleet", action: "driver.payment_submitted", entityName: "FleetDriverPaymentSubmission", entityId: submission.id, metadata: { amount, vehicleId, submissionType, periodStart, paymentMethod, reference: clean(formData.get("reference")) } });
  } catch (error) {
    if (error instanceof NotFoundError) redirect("/app/fleet/driver-portal?error=not-found");
    if (error instanceof InvalidPaymentAmountError) redirect("/app/fleet/driver-portal?error=invalid-amount");
    if (error instanceof FleetDuplicateSubmissionError) redirect("/app/fleet/driver-portal?error=duplicate-period");
    if (error instanceof FleetSalesTargetError) redirect("/app/fleet/driver-portal?error=invalid-target");
    if (error instanceof FleetPaymentEvidenceError) redirect("/app/fleet/driver-portal?error=invalid-evidence");
    if (error instanceof FleetPaymentDateError) redirect("/app/fleet/driver-portal?error=invalid-date");
    throw error;
  }
  revalidatePath("/app/fleet/driver-portal");
  redirect("/app/fleet/driver-portal?saved=1");
}

export async function reportMaintenanceFromDriverPortal(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("fleet");
  if (!hasPermission(tenant, PERMISSIONS.FLEET_DRIVER_SELF_SERVICE)) redirect("/app/fleet/driver-portal?tab=maintenance&error=forbidden");
  const session = await getServerAuthSession();
  if (!session?.user?.id) redirect("/login");
  const vehicleId = clean(formData.get("vehicleId"));
  const faultDescription = clean(formData.get("faultDescription"));
  if (!vehicleId || !faultDescription) redirect("/app/fleet/driver-portal?tab=maintenance&error=missing-fields");
  if (!(await canUserReportFleetVehicle(tenant.organizationId, vehicleId, session.user.id))) {
    redirect("/app/fleet/driver-portal?tab=maintenance&error=not-found");
  }
  const photoFiles = formData.getAll("photos").filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (photoFiles.length > MAX_FLEET_MAINTENANCE_ATTACHMENTS) {
    redirect("/app/fleet/driver-portal?tab=maintenance&error=too-many-photos");
  }
  try {
    const photos = await Promise.all(photoFiles.map((file) => fleetMaintenancePhotoData(file)));
    const request = await createFleetMaintenanceRequest(tenant.organizationId, {
      vehicleId,
      faultDescription,
      requestedById: session.user.id,
      photos: photos.filter((photo): photo is NonNullable<typeof photo> => photo !== null),
    });
    await logAuditEvent({
      organizationId: tenant.organizationId,
      userId: session.user.id,
      module: "fleet",
      action: "fleet.maintenance.submitted",
      entityName: "FleetMaintenanceRequest",
      entityId: request.id,
      metadata: { vehicleId, photoCount: photos.length },
    });
  } catch (error) {
    if (error instanceof NotFoundError) redirect("/app/fleet/driver-portal?tab=maintenance&error=not-found");
    if (error instanceof Error && error.message === "invalid-maintenance-photo") {
      redirect("/app/fleet/driver-portal?tab=maintenance&error=invalid-photo");
    }
    throw error;
  }
  revalidatePath("/app/fleet/driver-portal");
  redirect("/app/fleet/driver-portal?tab=maintenance&maintenance-saved=1");
}

export async function payFleetObligationOnline(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("fleet");
  if (!hasPermission(tenant, PERMISSIONS.FLEET_DRIVER_SELF_SERVICE)) redirect("/app/fleet/driver-portal?error=forbidden");
  const session = await getServerAuthSession();
  if (!session?.user?.id) redirect("/login");
  const vehicleId = clean(formData.get("vehicleId"));
  const submissionType = clean(formData.get("submissionType"));
  const periodStart = clean(formData.get("periodStart"));
  if (!vehicleId || !periodStart || !submissionType || !["DAILY_SALES", "WEEKLY_SALES", "WORK_AND_PAY"].includes(submissionType)) redirect("/app/fleet/driver-portal?error=invalid-type");
  try {
    const checkout = await initializeFleetOperationalPayment({ organizationId: tenant.organizationId, userId: session.user.id, vehicleId, contractId: clean(formData.get("contractId")), submissionType: submissionType as FleetDriverSubmissionType, periodStart: new Date(`${periodStart}T00:00:00.000Z`) });
    redirect(checkout.checkoutUrl);
  } catch (error) {
    if (error instanceof SettlementUnavailableError) redirect("/app/fleet/driver-portal?error=online-unavailable");
    console.error("[fleet] Online collection initialization failed", error);
    redirect("/app/fleet/driver-portal?error=online-failed");
  }
}
