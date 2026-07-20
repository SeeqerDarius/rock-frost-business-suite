"use server";

import { redirect } from "next/navigation";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { createFleetPayment, updateFleetPaymentStatus } from "@/modules/fleet/service";
import type { FleetPaymentType } from "@prisma/client";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

export async function createPayment(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.FLEET_PAYMENTS_MANAGE)) {
    redirect("/app/fleet/payments?error=forbidden");
  }

  const reference = clean(formData.get("reference"));
  const amount = clean(formData.get("amount"));
  const type = clean(formData.get("type")) as FleetPaymentType | null;
  const dateRaw = clean(formData.get("date"));

  if (!reference || !amount || !type) {
    redirect("/app/fleet/payments?error=missing-fields");
  }

  try {
    await createFleetPayment(tenant.organizationId, {
      reference,
      amount,
      type,
      date: dateRaw ? new Date(dateRaw) : new Date(),
      relatedEntity: clean(formData.get("relatedEntity")),
      relatedEntityId: clean(formData.get("relatedEntityId")),
    });
  } catch {
    redirect("/app/fleet/payments?error=duplicate");
  }

  redirect("/app/fleet/payments?saved=1");
}

export async function verifyPayment(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.FLEET_PAYMENTS_MANAGE)) {
    redirect("/app/fleet/payments?error=forbidden");
  }

  const id = clean(formData.get("id"));
  const decision = clean(formData.get("decision"));
  if (!id) return;

  if (decision === "reject") {
    await updateFleetPaymentStatus(tenant.organizationId, id, "REJECTED", false);
  } else {
    await updateFleetPaymentStatus(tenant.organizationId, id, "VERIFIED", true);
  }

  redirect("/app/fleet/payments?saved=1");
}
