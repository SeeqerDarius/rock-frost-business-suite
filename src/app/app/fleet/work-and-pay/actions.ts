"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import {
  createFleetWorkAndPayContract,
  recordFleetWorkAndPayPayment,
  updateFleetWorkAndPayContractStatus,
  NotFoundError,
  InvalidPaymentAmountError,
  FleetPaymentEvidenceError,
} from "@/modules/fleet/service";
import type { FleetContractStatus, FleetSalesTargetPeriod } from "@prisma/client";
import { getServerAuthSession } from "@/lib/auth/session";
import { postModuleRevenue } from "@/lib/accounting-integration";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

function cleanInt(value: FormDataEntryValue | null) {
  const str = clean(value);
  return str ? Number.parseInt(str, 10) : null;
}

export async function createWorkAndPayContract(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("fleet");
  if (!hasPermission(tenant, PERMISSIONS.FLEET_WORKANDPAY_MANAGE)) {
    redirect("/app/fleet/work-and-pay?error=forbidden");
  }

  const contractName = clean(formData.get("contractName"));
  const vehicleId = clean(formData.get("vehicleId"));
  const clientName = clean(formData.get("clientName"));
  const contractAmount = clean(formData.get("contractAmount"));
  const paymentSchedule = clean(formData.get("paymentSchedule")) as FleetSalesTargetPeriod | null;
  const scheduledPaymentAmount = clean(formData.get("scheduledPaymentAmount"));

  if (!contractName || !vehicleId || !clientName || !contractAmount || !scheduledPaymentAmount || !paymentSchedule || !["DAILY", "WEEKLY"].includes(paymentSchedule)) {
    redirect("/app/fleet/work-and-pay?error=missing-fields");
  }

  const startsAtRaw = clean(formData.get("startsAt"));

  try {
    const session = await getServerAuthSession();
    const { contract, depositPayment } = await createFleetWorkAndPayContract(tenant.organizationId, {
      contractName,
      vehicleId,
      clientName,
      contractAmount,
      depositAmount: clean(formData.get("depositAmount")) ?? "0",
      paymentSchedule,
      scheduledPaymentAmount,
      remainingPaymentPeriods: cleanInt(formData.get("remainingPaymentPeriods")),
      startsAt: startsAtRaw ? new Date(startsAtRaw) : null,
    });
    if (depositPayment) {
      await postModuleRevenue(tenant.organizationId, {
        sourceModule: "fleet",
        sourceType: "FLEET_PAYMENT",
        sourceId: depositPayment.id,
        postingPurpose: "COLLECTED",
        amount: depositPayment.amount.toString(),
        entryDate: depositPayment.date,
        description: `Work & Pay deposit: ${contract.contractName}`,
        createdById: session?.user?.id ?? null,
      });
    }
  } catch (error) {
    if (error instanceof NotFoundError) redirect("/app/fleet/work-and-pay?error=not-found");
    if (error instanceof InvalidPaymentAmountError) redirect("/app/fleet/work-and-pay?error=invalid-amount");
    throw error;
  }

  revalidatePath("/app/fleet/work-and-pay");
  redirect("/app/fleet/work-and-pay?saved=1");
}

export async function recordContractPayment(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("fleet");
  if (!hasPermission(tenant, PERMISSIONS.FLEET_WORKANDPAY_MANAGE)) {
    redirect("/app/fleet/work-and-pay?error=forbidden");
  }

  const id = clean(formData.get("id"));
  const amountRaw = clean(formData.get("amount"));
  const amount = amountRaw ? Number.parseFloat(amountRaw) : NaN;
  const paymentDate = clean(formData.get("paymentDate"));
  const paymentMethod = clean(formData.get("paymentMethod"));

  if (!id || Number.isNaN(amount) || amount <= 0 || !paymentDate || !paymentMethod) {
    redirect("/app/fleet/work-and-pay?error=invalid-amount");
  }

  try {
    const session = await getServerAuthSession();
    const { contract, payment } = await recordFleetWorkAndPayPayment(tenant.organizationId, id, {
      amount,
      paymentDate: new Date(`${paymentDate}T00:00:00.000Z`),
      paymentMethod: paymentMethod as "CASH" | "MOBILE_MONEY" | "BANK_TRANSFER" | "CARD" | "CHEQUE" | "OTHER",
      reference: clean(formData.get("reference")),
      actorId: session?.user?.id,
    });
    await postModuleRevenue(tenant.organizationId, {
      sourceModule: "fleet",
      sourceType: "FLEET_PAYMENT",
      sourceId: payment.id,
      postingPurpose: "COLLECTED",
      amount: payment.amount.toString(),
      entryDate: payment.date,
      description: `Work & Pay instalment recorded: ${contract.contractName}`,
      createdById: session?.user?.id ?? null,
    });
  } catch (error) {
    if (error instanceof NotFoundError) redirect("/app/fleet/work-and-pay?error=not-found");
    if (error instanceof InvalidPaymentAmountError) redirect("/app/fleet/work-and-pay?error=invalid-amount");
    if (error instanceof FleetPaymentEvidenceError) redirect("/app/fleet/work-and-pay?error=invalid-evidence");
    throw error;
  }
  revalidatePath("/app/fleet/work-and-pay");
  redirect("/app/fleet/work-and-pay?saved=1");
}

export async function updateContractStatus(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("fleet");
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
