"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { cuid, parseWithSchema } from "@/lib/validation";
import { buildTenantAppUrl } from "@/lib/app-url";
import { initiateGatewayPayment } from "@/platform/subscriptions/service";

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
