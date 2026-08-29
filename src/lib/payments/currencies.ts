import "server-only";

import type { GatewayProvider } from "./types";

/**
 * Currencies each configured payment gateway can settle to. Hand-maintained,
 * not a live lookup - Paystack's actual supported currencies are keyed to
 * the country of the merchant account behind PAYSTACK_SECRET_KEY, and this
 * codebase has no API call to discover that automatically. Confirm against
 * the gateway's current documentation before relying on this list for a
 * real go-live decision.
 */
export const SUPPORTED_CURRENCIES: Record<GatewayProvider, readonly string[]> = {
  PAYSTACK: ["GHS", "NGN", "ZAR", "USD", "KES"],
  FLUTTERWAVE: ["GHS", "NGN", "ZAR", "USD", "KES", "UGX", "TZS"],
};

export function isCurrencySupported(provider: GatewayProvider, currency: string): boolean {
  return SUPPORTED_CURRENCIES[provider].includes(currency.toUpperCase());
}
