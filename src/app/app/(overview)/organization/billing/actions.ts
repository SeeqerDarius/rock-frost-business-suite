"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { cuid, parseWithSchema } from "@/lib/validation";
import { buildTenantAppUrl } from "@/lib/app-url";
import { cancelPaystackAutomaticRenewal, createSelfServiceBundleSubscription, createSelfServiceCartSubscription, createSelfServiceSubscription, getPaystackManagementLinkForOrganization, initiateGatewayPayment, SelfServiceSubscriptionExistsError, UnavailablePlanTierError } from "@/platform/subscriptions/service";
import { getModulePriceMap, getModuleTierPrice, getPricingBundleMap, type PricingBundleKey } from "@/lib/pricing";
import { moduleHasPublishedLadder } from "@/platform/entitlements/catalogue";
import { PLAN_TIERS, isQuoteOnlyTier } from "@/platform/entitlements/tiers";
import type { BusinessModuleKey } from "@/platform/modules/registry";

const startSchema = z.object({
  subscriptionId: cuid,
  provider: z.enum(["PAYSTACK", "FLUTTERWAVE"]),
});

const CALLBACK_PATH: Record<"PAYSTACK" | "FLUTTERWAVE", string> = {
  PAYSTACK: "/app/organization/billing/callback/paystack",
  FLUTTERWAVE: "/app/organization/billing/callback/flutterwave",
};

export async function startGatewayPayment(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.ORG_SETTINGS_MANAGE)) redirect("/app/dashboard");

  const parsed = parseWithSchema(startSchema, {
    subscriptionId: String(formData.get("subscriptionId") ?? "").trim(),
    provider: String(formData.get("provider") ?? "").trim(),
  });
  if (!parsed.success) redirect("/app/organization/billing?error=invalid");

  let checkoutUrl: string;
  try {
    const result = await initiateGatewayPayment({
      subscriptionId: parsed.data.subscriptionId,
      organizationId: tenant.organizationId,
      provider: parsed.data.provider,
      payerUserId: tenant.userId,
      callbackUrl: buildTenantAppUrl(CALLBACK_PATH[parsed.data.provider]),
    });
    checkoutUrl = result.checkoutUrl;
  } catch (error) {
    console.error("[billing] Failed to start gateway payment:", error);
    redirect("/app/organization/billing?error=payment-failed");
  }

  redirect(checkoutUrl);
}

const selfServiceSchema = z.object({
  productKey: z.string().trim().min(1),
  productType: z.enum(["MODULE", "BUNDLE"]),
  // Only a module with a published ladder needs one, and a suite never does.
  tier: z.enum(PLAN_TIERS).optional(),
  billingCycle: z.enum(["MONTHLY", "ANNUAL"]),
});

export async function startSelfServiceCheckout(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.ORG_SETTINGS_MANAGE)) redirect("/app/dashboard");
  const parsed = parseWithSchema(selfServiceSchema, {
    productKey: String(formData.get("productKey") ?? formData.get("moduleKey") ?? ""),
    productType: String(formData.get("productType") ?? "MODULE"),
    ...(formData.get("tier") ? { tier: String(formData.get("tier")) } : {}),
    billingCycle: String(formData.get("billingCycle") ?? ""),
  });
  if (!parsed.success) redirect("/app/organization/billing?error=invalid-selection");
  const validProduct = parsed.data.productType === "MODULE"
    ? (await getModulePriceMap()).has(parsed.data.productKey as BusinessModuleKey)
    : (await getPricingBundleMap()).has(parsed.data.productKey as PricingBundleKey);
  if (!validProduct) redirect("/app/organization/billing?error=invalid-selection");

  // Settled before the subscription row is written, so a bad plan choice is a
  // message rather than a pending subscription nobody can pay for.
  if (parsed.data.productType === "MODULE" && moduleHasPublishedLadder(parsed.data.productKey)) {
    const tier = parsed.data.tier;
    if (!tier || isQuoteOnlyTier(tier)) redirect("/app/organization/billing?error=plan-unavailable");
    if (!await getModuleTierPrice(parsed.data.productKey, tier)) redirect("/app/organization/billing?error=plan-unavailable");
  }

  let checkoutUrl: string;
  try {
    const common = { organizationId: tenant.organizationId, billingCycle: parsed.data.billingCycle, autoRenew: formData.get("autoRenew") === "true", actorId: tenant.userId };
    const subscription = parsed.data.productType === "BUNDLE"
      ? await createSelfServiceBundleSubscription({ ...common, bundleKey: parsed.data.productKey as PricingBundleKey })
      : await createSelfServiceSubscription({ ...common, moduleKey: parsed.data.productKey as BusinessModuleKey, tier: parsed.data.tier });
    const result = await initiateGatewayPayment({
      subscriptionId: subscription.id,
      organizationId: tenant.organizationId,
      provider: "PAYSTACK",
      payerUserId: tenant.userId,
      callbackUrl: buildTenantAppUrl(CALLBACK_PATH.PAYSTACK),
    });
    checkoutUrl = result.checkoutUrl;
  } catch (error) {
    console.error("[billing] Failed to start self-service checkout:", error);
    if (error instanceof SelfServiceSubscriptionExistsError) {
      redirect("/app/organization/billing?error=already-subscribed");
    }
    if (error instanceof UnavailablePlanTierError) {
      redirect("/app/organization/billing?error=plan-unavailable");
    }
    redirect("/app/organization/billing?error=payment-failed");
  }
  redirect(checkoutUrl);
}

const cartSchema = z.object({
  moduleKeys: z.array(z.string().trim().min(1)).min(1),
  billingCycle: z.enum(["MONTHLY", "ANNUAL"]),
});

export async function startCartCheckout(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.ORG_SETTINGS_MANAGE)) redirect("/app/dashboard");

  const moduleKeys = [...new Set(formData.getAll("moduleKeys").map((value) => String(value).trim()).filter(Boolean))];
  const parsed = parseWithSchema(cartSchema, {
    moduleKeys,
    billingCycle: String(formData.get("billingCycle") ?? ""),
  });
  if (!parsed.success) redirect("/app/organization/billing?error=invalid-selection");
  const modulePriceMap = await getModulePriceMap();
  if (parsed.data.moduleKeys.some((key) => !modulePriceMap.has(key as BusinessModuleKey))) {
    redirect("/app/organization/billing?error=invalid-selection");
  }
  // The cart has one price per module and no way to choose a plan, so a
  // module with a ladder is bought from its own card instead. Without this,
  // a cart would grant full access at the single headline price and quietly
  // undercut the ladder it is meant to sell.
  if (parsed.data.moduleKeys.some((key) => moduleHasPublishedLadder(key))) {
    redirect("/app/organization/billing?error=plan-required");
  }

  let checkoutUrl: string;
  try {
    const subscription = await createSelfServiceCartSubscription({
      organizationId: tenant.organizationId,
      moduleKeys: parsed.data.moduleKeys as BusinessModuleKey[],
      billingCycle: parsed.data.billingCycle,
      autoRenew: formData.get("autoRenew") === "true",
      actorId: tenant.userId,
    });
    const result = await initiateGatewayPayment({
      subscriptionId: subscription.id,
      organizationId: tenant.organizationId,
      provider: "PAYSTACK",
      payerUserId: tenant.userId,
      callbackUrl: buildTenantAppUrl(CALLBACK_PATH.PAYSTACK),
    });
    checkoutUrl = result.checkoutUrl;
  } catch (error) {
    console.error("[billing] Failed to start cart checkout:", error);
    if (error instanceof SelfServiceSubscriptionExistsError) {
      redirect("/app/organization/billing?error=already-subscribed");
    }
    redirect("/app/organization/billing?error=payment-failed");
  }
  redirect(checkoutUrl);
}

export async function managePaystackSubscription(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.ORG_SETTINGS_MANAGE)) redirect("/app/dashboard");
  const subscriptionId = cuid.safeParse(String(formData.get("subscriptionId") ?? "").trim());
  if (!subscriptionId.success) redirect("/app/organization/billing?error=invalid");
  try {
    redirect(await getPaystackManagementLinkForOrganization(subscriptionId.data, tenant.organizationId));
  } catch (error) {
    console.error("[billing] Failed to open Paystack subscription management:", error);
    redirect("/app/organization/billing?error=manage-failed");
  }
}

export async function cancelPaystackRenewal(formData: FormData): Promise<void> {
  const tenant = await requireCurrentTenant();
  if (!hasPermission(tenant, PERMISSIONS.ORG_SETTINGS_MANAGE)) redirect("/app/dashboard");
  const subscriptionId = cuid.safeParse(String(formData.get("subscriptionId") ?? "").trim());
  if (!subscriptionId.success) redirect("/app/organization/billing?error=invalid");
  try {
    await cancelPaystackAutomaticRenewal(subscriptionId.data, tenant.organizationId, tenant.userId);
  } catch (error) {
    console.error("[billing] Failed to cancel Paystack automatic renewal:", error);
    redirect("/app/organization/billing?error=cancel-failed");
  }
  redirect("/app/organization/billing?renewal-cancelled=1");
}
