"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { cuid, parseWithSchema } from "@/lib/validation";
import { buildTenantAppUrl } from "@/lib/app-url";
import { cancelPaystackAutomaticRenewal, getPaystackManagementLinkForOrganization, initiateGatewayPayment } from "@/platform/subscriptions/service";

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
