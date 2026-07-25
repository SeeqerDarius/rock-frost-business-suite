"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { createFleetPayment, updateFleetPaymentStatus } from "@/modules/fleet/service";
import { moneyAmount, shortText, longText, cuid, dateInput, parseWithSchema } from "@/lib/validation";

function clean(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

const paymentTypeSchema = z.enum(["WEEKLY_SALES", "OWNER_PAYOUT", "DRIVER_PAYMENT", "MAINTENANCE", "WORK_AND_PAY", "OTHER"]);

const paymentSchema = z.object({
  reference: shortText,
  amount: moneyAmount,
  type: paymentTypeSchema,
  date: dateInput.optional(),
  relatedEntity: longText.optional(),
  relatedEntityId: cuid.optional(),
});

export async function createPayment(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("fleet");
  if (!hasPermission(tenant, PERMISSIONS.FLEET_PAYMENTS_MANAGE)) {
    redirect("/app/fleet/payments?error=forbidden");
  }

  const reference = clean(formData.get("reference"));
  const amount = clean(formData.get("amount"));
  const type = clean(formData.get("type"));

  if (!reference || !amount || !type) {
    redirect("/app/fleet/payments?error=missing-fields");
  }

  const parsed = parseWithSchema(paymentSchema, {
    reference,
    amount,
    type,
    date: clean(formData.get("date")) ?? undefined,
    relatedEntity: clean(formData.get("relatedEntity")) ?? undefined,
    relatedEntityId: clean(formData.get("relatedEntityId")) ?? undefined,
  });
  if (!parsed.success) {
    redirect("/app/fleet/payments?error=invalid-input");
  }

  try {
    await createFleetPayment(tenant.organizationId, {
      reference: parsed.data.reference,
      amount: parsed.data.amount,
      type: parsed.data.type,
      date: parsed.data.date ?? new Date(),
      relatedEntity: parsed.data.relatedEntity ?? null,
      relatedEntityId: parsed.data.relatedEntityId ?? null,
    });
  } catch {
    redirect("/app/fleet/payments?error=duplicate");
  }

  revalidatePath("/app/fleet/payments");
  redirect("/app/fleet/payments?saved=1");
}

export async function verifyPayment(formData: FormData): Promise<void> {
  const tenant = await requireModuleAccess("fleet");
  if (!hasPermission(tenant, PERMISSIONS.FLEET_PAYMENTS_MANAGE)) {
    redirect("/app/fleet/payments?error=forbidden");
  }

  const idRaw = clean(formData.get("id"));
  const decision = clean(formData.get("decision"));
  if (!idRaw) return;

  const parsedId = parseWithSchema(cuid, idRaw);
  if (!parsedId.success) {
    redirect("/app/fleet/payments?error=invalid-input");
  }
  const id = parsedId.data;

  if (decision === "reject") {
    await updateFleetPaymentStatus(tenant.organizationId, id, "REJECTED", false);
  } else {
    await updateFleetPaymentStatus(tenant.organizationId, id, "VERIFIED", true);
  }

  revalidatePath("/app/fleet/payments");
  redirect("/app/fleet/payments?saved=1");
}
