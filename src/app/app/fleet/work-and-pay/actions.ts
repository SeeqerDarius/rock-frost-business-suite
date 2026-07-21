"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import {
  createFleetWorkAndPayContract,
  recordFleetWorkAndPayPayment,
  updateFleetWorkAndPayContractStatus,
  NotFoundError,
  InvalidPaymentAmountError,
} from "@/modules/fleet/service";
import type { FleetContractStatus } from "@prisma/client";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

function cleanInt(value: FormDataEntryValue | null) {
  const str = clean(value);
  return str ? Number.parseInt(str, 10) : null;
}

export async function createWorkAndPayContract(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.FLEET_WORKANDPAY_MANAGE)) {
    redirect("/app/fleet/work-and-pay?error=forbidden");
  }

  const contractName = clean(formData.get("contractName"));
  const vehicleId = clean(formData.get("vehicleId"));
  const clientName = clean(formData.get("clientName"));
  const contractAmount = clean(formData.get("contractAmount"));
  const weeklyPaymentAmount = clean(formData.get("weeklyPaymentAmount"));

  if (!contractName || !vehicleId || !clientName || !contractAmount || !weeklyPaymentAmount) {
    redirect("/app/fleet/work-and-pay?error=missing-fields");
  }

  const startsAtRaw = clean(formData.get("startsAt"));

  try {
    await createFleetWorkAndPayContract(tenant.organizationId, {
      contractName,
      vehicleId,
      clientName,
      contractAmount,
      depositAmount: clean(formData.get("depositAmount")) ?? "0",
      weeklyPaymentAmount,
      remainingDurationWeeks: cleanInt(formData.get("remainingDurationWeeks")),
      startsAt: startsAtRaw ? new Date(startsAtRaw) : null,
    });
  } catch (error) {
    if (error instanceof NotFoundError) redirect("/app/fleet/work-and-pay?error=not-found");
    throw error;
  }

  revalidatePath("/app/fleet/work-and-pay");
  redirect("/app/fleet/work-and-pay?saved=1");
}

export async function recordContractPayment(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.FLEET_WORKANDPAY_MANAGE)) {
    redirect("/app/fleet/work-and-pay?error=forbidden");
  }

  const id = clean(formData.get("id"));
  const amountRaw = clean(formData.get("amount"));
  const amount = amountRaw ? Number.parseFloat(amountRaw) : NaN;

  if (!id || Number.isNaN(amount) || amount <= 0) {
    redirect("/app/fleet/work-and-pay?error=invalid-amount");
  }

  try {
    await recordFleetWorkAndPayPayment(tenant.organizationId, id, amount);
  } catch (error) {
    if (error instanceof NotFoundError) redirect("/app/fleet/work-and-pay?error=not-found");
    if (error instanceof InvalidPaymentAmountError) redirect("/app/fleet/work-and-pay?error=invalid-amount");
    throw error;
  }
  revalidatePath("/app/fleet/work-and-pay");
  redirect("/app/fleet/work-and-pay?saved=1");
}

export async function updateContractStatus(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.FLEET_WORKANDPAY_MANAGE)) {
    redirect("/app/fleet/work-and-pay?error=forbidden");
  }

  const id = clean(formData.get("id"));
  const status = clean(formData.get("status")) as FleetContractStatus | null;
  if (!id || !status) return;

  await updateFleetWorkAndPayContractStatus(tenant.organizationId, id, status);
  revalidatePath("/app/fleet/work-and-pay");
  redirect("/app/fleet/work-and-pay?saved=1");
}
