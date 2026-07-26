import "server-only";

import type { GatewayProvider } from "./types";

/** Lets UI hide a "Pay with X" button rather than offer a checkout that will fail — same graceful-degradation pattern as RESEND_API_KEY in src/lib/email.ts. */
export function isGatewayConfigured(provider: GatewayProvider): boolean {
  if (provider === "PAYSTACK") return Boolean(process.env.PAYSTACK_SECRET_KEY?.trim());
  return Boolean(process.env.FLUTTERWAVE_SECRET_KEY?.trim());
}

export function configuredGatewayProviders(): GatewayProvider[] {
  return (["PAYSTACK", "FLUTTERWAVE"] as const).filter(isGatewayConfigured);
}
