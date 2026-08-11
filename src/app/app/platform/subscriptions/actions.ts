"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePlatformOperator } from "@/lib/auth/module-access";
import { cuid, dateInput, longText, moneyAmountNonNegative, parseWithSchema, positiveInt, shortText } from "@/lib/validation";
import { activateSubscription, cancelSubscription, createSubscription } from "@/platform/subscriptions/service";
import { SeatLimitExceededError, updateSubscriptionSeatLimit } from "@/platform/subscriptions/seats";

const createSchema = z.object({
  organizationId: cuid,
  moduleId: cuid,
  moduleRequestId: z.union([cuid, z.literal("")]).optional(),
  contactSubmissionId: z.union([cuid, z.literal("")]).optional(),
  mode: z.enum(["MANUAL_OFFLINE", "PLATFORM_MANAGED"]),
  durationMonths: positiveInt,
  seatLimit: positiveInt.optional(),
  amount: moneyAmountNonNegative,
  currency: z.string().trim().length(3),
  notes: longText.optional(),
});

export async function createSubscriptionAction(formData: FormData): Promise<void> {
  const tenant = await requirePlatformOperator();
  const parsed = parseWithSchema(createSchema, Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/platform/subscriptions?error=invalid");
  try {
    await createSubscription({
      ...parsed.data,
      durationMonths: parsed.data.durationMonths,
      amount: String(parsed.data.amount),
      seatLimit: formData.get("unlimitedSeats") === "true" ? null : parsed.data.seatLimit ?? 5,
      moduleRequestId: parsed.data.moduleRequestId || null,
      contactSubmissionId: parsed.data.contactSubmissionId || null,
      autoRenew: formData.get("autoRenew") === "true",
      notes: parsed.data.notes || null,
      actorId: tenant.userId,
    });
  } catch {
    redirect("/app/platform/subscriptions?error=create");
  }
  revalidatePath("/app/platform/subscriptions");
  redirect("/app/platform/subscriptions?created=1");
}

export async function updateSubscriptionSeatLimitAction(formData: FormData): Promise<void> {
  const tenant = await requirePlatformOperator();
  const parsed = parseWithSchema(z.object({ subscriptionId: cuid, seatLimit: positiveInt.optional() }), Object.fromEntries(formData));
  const seatLimit = formData.get("unlimitedSeats") === "true" ? null : parsed.success ? parsed.data.seatLimit : undefined;
  if (!parsed.success || seatLimit === undefined || (seatLimit != null && seatLimit > 100_000)) redirect("/app/platform/subscriptions?error=invalid");
  try {
    await updateSubscriptionSeatLimit({ subscriptionId: parsed.data.subscriptionId, seatLimit, actorId: tenant.userId });
  } catch (error) {
    if (error instanceof SeatLimitExceededError) redirect("/app/platform/subscriptions?error=seats-below-usage");
    redirect("/app/platform/subscriptions?error=seats");
  }
  revalidatePath("/app/platform/subscriptions");
  revalidatePath("/app/organization/billing");
  revalidatePath("/app/administration");
  redirect("/app/platform/subscriptions?seats=1");
}

export async function activateSubscriptionAction(formData: FormData): Promise<void> {
  const tenant = await requirePlatformOperator();
  const parsed = parseWithSchema(z.object({
    subscriptionId: cuid,
    paymentReference: shortText,
    paymentMethod: shortText,
    startsAt: z.union([dateInput, z.literal("")]).optional(),
  }), Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/platform/subscriptions?error=invalid");
  try {
    await activateSubscription({
      subscriptionId: parsed.data.subscriptionId,
      actorId: tenant.userId,
      paymentReference: parsed.data.paymentReference,
      paymentMethod: parsed.data.paymentMethod,
      startsAt: parsed.data.startsAt || undefined,
    });
  } catch {
    redirect("/app/platform/subscriptions?error=activate");
  }
  revalidatePath("/app/platform/subscriptions");
  revalidatePath("/app/platform/organizations");
  revalidatePath("/app/modules");
  redirect("/app/platform/subscriptions?activated=1");
}

export async function cancelSubscriptionAction(formData: FormData): Promise<void> {
  const tenant = await requirePlatformOperator();
  const id = cuid.safeParse(String(formData.get("subscriptionId") ?? ""));
  if (!id.success) redirect("/app/platform/subscriptions?error=invalid");
  await cancelSubscription({ subscriptionId: id.data, actorId: tenant.userId });
  revalidatePath("/app/platform/subscriptions");
  revalidatePath("/app/modules");
  redirect("/app/platform/subscriptions?cancelled=1");
}
