"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import {
  submitFleetDriverPayment,
  NotFoundError,
  InvalidPaymentAmountError,
  FleetDuplicateSubmissionError,
  FleetSalesTargetError,
  FleetPaymentEvidenceError,
} from "@/modules/fleet/service";
import { logAuditEvent } from "@/lib/audit";
import type { FleetDriverSubmissionType } from "@prisma/client";

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
    throw error;
  }
  revalidatePath("/app/fleet/driver-portal");
  redirect("/app/fleet/driver-portal?saved=1");
}
