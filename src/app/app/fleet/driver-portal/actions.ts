"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import { submitFleetDriverPayment, NotFoundError, InvalidPaymentAmountError } from "@/modules/fleet/service";
import { logAuditEvent } from "@/lib/audit";

const clean = (value: FormDataEntryValue | null) => String(value ?? "").trim() || null;

export async function submitDriverPayment(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("fleet");
  if (!hasPermission(tenant, PERMISSIONS.FLEET_DRIVER_SELF_SERVICE)) redirect("/app/fleet/driver-portal?error=forbidden");
  const session = await getServerAuthSession();
  if (!session?.user?.id) redirect("/login");
  const amount = clean(formData.get("amount"));
  const paymentDate = clean(formData.get("paymentDate"));
  const paymentMethod = clean(formData.get("paymentMethod"));
  if (!amount || !paymentDate || !paymentMethod) redirect("/app/fleet/driver-portal?error=missing-fields");
  try {
    const submission = await submitFleetDriverPayment(tenant.organizationId, session.user.id, {
      vehicleId: clean(formData.get("vehicleId")), contractId: clean(formData.get("contractId")), amount,
      paymentDate: new Date(`${paymentDate}T00:00:00.000Z`), paymentMethod,
      reference: clean(formData.get("reference")), notes: clean(formData.get("notes")),
    });
    await logAuditEvent({ organizationId: tenant.organizationId, userId: session.user.id, module: "fleet", action: "driver.payment_submitted", entityName: "FleetDriverPaymentSubmission", entityId: submission.id, metadata: { amount } });
  } catch (error) {
    if (error instanceof NotFoundError) redirect("/app/fleet/driver-portal?error=not-found");
    if (error instanceof InvalidPaymentAmountError) redirect("/app/fleet/driver-portal?error=invalid-amount");
    throw error;
  }
  revalidatePath("/app/fleet/driver-portal");
  redirect("/app/fleet/driver-portal?saved=1");
}
