"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit";
import { requirePlatformOperator } from "@/lib/auth/module-access";
import { moneyAmountPositive, parseWithSchema, positiveInt, shortText } from "@/lib/validation";
import { getModulePriceMap, getPricingBundleMap } from "@/lib/pricing";

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

const promotionSchema = z.object({
  name: shortText,
  targetType: z.enum(["MODULE", "BUNDLE"]),
  targetKey: shortText,
  billingCycle: z.enum(["MONTHLY", "ANNUAL"]),
  amountGhs: moneyAmountPositive,
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
});

export async function createPricingPromotion(formData: FormData): Promise<void> {
  const tenant = await requirePlatformOperator();
  const parsed = parseWithSchema(promotionSchema, Object.fromEntries(formData));
  if (!parsed.success || parsed.data.endsAt <= parsed.data.startsAt) redirect("/app/platform/subscriptions?error=invalid-promotion#promotions");
  const data = parsed.data;
  const amountGhs = Number(data.amountGhs);
  const [modules, bundles] = await Promise.all([getModulePriceMap(), getPricingBundleMap()]);
  const original = data.targetType === "MODULE"
    ? (() => { const price = modules.get(data.targetKey as never); return price ? (data.billingCycle === "ANNUAL" ? price.annualGhs : price.monthlyGhs) : undefined; })()
    : (() => { const bundle = bundles.get(data.targetKey); return bundle ? (data.billingCycle === "ANNUAL" ? bundle.monthlyGhs * 10 : bundle.monthlyGhs) : undefined; })();
  if (original === undefined || amountGhs >= original) redirect("/app/platform/subscriptions?error=invalid-promotion#promotions");
  const promotion = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pricing-promotion:${data.targetType}:${data.targetKey}:${data.billingCycle}`}))`;
    const overlap = await tx.pricingPromotion.findFirst({ where: {
      targetType: data.targetType, targetKey: data.targetKey, billingCycle: data.billingCycle, active: true,
      startsAt: { lt: data.endsAt }, endsAt: { gt: data.startsAt },
    }, select: { id: true } });
    if (overlap) return null;
    return tx.pricingPromotion.create({ data: { ...data, amountGhs, createdById: tenant.userId } });
  });
  if (!promotion) redirect("/app/platform/subscriptions?error=promotion-overlap#promotions");
  await logAuditEvent({ organizationId: tenant.organizationId, userId: tenant.userId, module: "platform", action: "pricing.promotion_created", entityName: "PricingPromotion", entityId: promotion.id, metadata: { name: data.name, targetType: data.targetType, targetKey: data.targetKey, billingCycle: data.billingCycle, amountGhs, startsAt: data.startsAt.toISOString(), endsAt: data.endsAt.toISOString() } });
  revalidatePricing();
  redirect("/app/platform/subscriptions?saved=promotion#promotions");
}

export async function stopPricingPromotion(formData: FormData): Promise<void> {
  const tenant = await requirePlatformOperator();
  const id = String(formData.get("promotionId") ?? "");
  if (!id) redirect("/app/platform/subscriptions?error=invalid-promotion#promotions");
  const promotion = await db.pricingPromotion.updateMany({ where: { id, active: true }, data: { active: false } });
  if (!promotion.count) redirect("/app/platform/subscriptions?error=invalid-promotion#promotions");
  await logAuditEvent({ organizationId: tenant.organizationId, userId: tenant.userId, module: "platform", action: "pricing.promotion_stopped", entityName: "PricingPromotion", entityId: id });
  revalidatePricing();
  redirect("/app/platform/subscriptions?saved=promotion-stopped#promotions");
}
