"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit";
import { requirePlatformOperator } from "@/lib/auth/module-access";
import { moneyAmountPositive, parseWithSchema, positiveInt, shortText } from "@/lib/validation";

function revalidatePricing() {
  revalidatePath("/app/platform/subscriptions");
  revalidatePath("/pricing");
  revalidatePath("/subscribe");
  revalidatePath("/app/organization/billing");
}

const modulePriceSchema = z.object({
  moduleKey: shortText,
  monthlyGhs: moneyAmountPositive,
  annualGhs: moneyAmountPositive,
  includedSeats: positiveInt,
  additionalSeatGhs: moneyAmountPositive,
});

export async function updateModulePricePlan(formData: FormData): Promise<void> {
  const tenant = await requirePlatformOperator();
  const parsed = parseWithSchema(modulePriceSchema, Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/platform/subscriptions?error=invalid-price#pricing-catalogue");
  const updated = await db.modulePricingPlan.updateMany({
    where: { moduleKey: parsed.data.moduleKey },
    data: {
      monthlyGhs: parsed.data.monthlyGhs,
      annualGhs: parsed.data.annualGhs,
      includedSeats: parsed.data.includedSeats,
      additionalSeatGhs: parsed.data.additionalSeatGhs,
    },
  });
  if (updated.count === 0) redirect("/app/platform/subscriptions?error=price-not-found#pricing-catalogue");
  await logAuditEvent({
    organizationId: tenant.organizationId,
    userId: tenant.userId,
    module: "platform",
    action: "pricing.module_price_updated",
    entityName: "ModulePricingPlan",
    entityId: parsed.data.moduleKey,
    metadata: { monthlyGhs: parsed.data.monthlyGhs, annualGhs: parsed.data.annualGhs, includedSeats: parsed.data.includedSeats, additionalSeatGhs: parsed.data.additionalSeatGhs },
  });
  revalidatePricing();
  redirect("/app/platform/subscriptions?saved=price#pricing-catalogue");
}

const bundlePriceSchema = z.object({
  bundleKey: shortText,
  name: shortText,
  monthlyGhs: moneyAmountPositive,
});

export async function updatePricingBundlePrice(formData: FormData): Promise<void> {
  const tenant = await requirePlatformOperator();
  const parsed = parseWithSchema(bundlePriceSchema, Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/platform/subscriptions?error=invalid-bundle#pricing-catalogue");
  const updated = await db.pricingBundle.updateMany({
    where: { key: parsed.data.bundleKey },
    data: { name: parsed.data.name, monthlyGhs: parsed.data.monthlyGhs },
  });
  if (updated.count === 0) redirect("/app/platform/subscriptions?error=bundle-not-found#pricing-catalogue");
  await logAuditEvent({
    organizationId: tenant.organizationId,
    userId: tenant.userId,
    module: "platform",
    action: "pricing.bundle_price_updated",
    entityName: "PricingBundle",
    entityId: parsed.data.bundleKey,
    metadata: { name: parsed.data.name, monthlyGhs: parsed.data.monthlyGhs },
  });
  revalidatePricing();
  redirect("/app/platform/subscriptions?saved=bundle#pricing-catalogue");
}
