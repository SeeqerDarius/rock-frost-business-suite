"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit";
import { requirePlatformOperator } from "@/lib/auth/module-access";
import { moneyAmountPositive, parseWithSchema, positiveInt, shortText } from "@/lib/validation";
import { PUBLIC_ADDONS, type PublicAddonKey } from "@/lib/pricing-shared";

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

const addonPriceSchema = z.object({
  addonKey: z.enum(PUBLIC_ADDONS.map((addon) => addon.key) as [PublicAddonKey, ...PublicAddonKey[]]),
  monthlyGhs: moneyAmountPositive,
  annualGhs: moneyAmountPositive,
});

/**
 * Sets the confirmed price of an optional add-on. Unlike module prices, an
 * add-on row is created here the first time Rock Frost confirms a price;
 * nothing seeds one, so public pages never show an unconfirmed number.
 */
export async function updateAddonPrice(formData: FormData): Promise<void> {
  const tenant = await requirePlatformOperator();
  const parsed = parseWithSchema(addonPriceSchema, Object.fromEntries(formData));
  if (!parsed.success) redirect("/app/platform/subscriptions?error=invalid-price#addon-pricing");
  await db.addonPricingPlan.upsert({
    where: { addonKey: parsed.data.addonKey },
    update: { monthlyGhs: parsed.data.monthlyGhs, annualGhs: parsed.data.annualGhs },
    create: { addonKey: parsed.data.addonKey, monthlyGhs: parsed.data.monthlyGhs, annualGhs: parsed.data.annualGhs },
  });
  await logAuditEvent({
    organizationId: tenant.organizationId,
    userId: tenant.userId,
    module: "platform",
    action: "pricing.addon_price_updated",
    entityName: "AddonPricingPlan",
    entityId: parsed.data.addonKey,
    metadata: { monthlyGhs: parsed.data.monthlyGhs, annualGhs: parsed.data.annualGhs },
  });
  revalidatePricing();
  redirect("/app/platform/subscriptions?saved=addon#addon-pricing");
}

/** Withdraws a published add-on price, returning public pages to "priced on request". */
export async function clearAddonPrice(formData: FormData): Promise<void> {
  const tenant = await requirePlatformOperator();
  const addonKey = String(formData.get("addonKey") ?? "");
  if (!PUBLIC_ADDONS.some((addon) => addon.key === addonKey)) redirect("/app/platform/subscriptions?error=invalid-price#addon-pricing");
  await db.addonPricingPlan.deleteMany({ where: { addonKey } });
  await logAuditEvent({
    organizationId: tenant.organizationId,
    userId: tenant.userId,
    module: "platform",
    action: "pricing.addon_price_cleared",
    entityName: "AddonPricingPlan",
    entityId: addonKey,
  });
  revalidatePricing();
  redirect("/app/platform/subscriptions?saved=addon#addon-pricing");
}
