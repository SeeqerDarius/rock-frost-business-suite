import "server-only";

export type GatewayProvider = "PAYSTACK" | "FLUTTERWAVE";

export interface InitializeTransactionInput {
  /** Our own generated reference — the gateway must echo this back so a webhook/callback can find the Subscription row. */
  reference: string;
  /** Major currency units (e.g. "1200.00" GHS) — each client converts to whatever unit its own API expects. */
  amount: string;
  currency: string;
  customerEmail: string;
  /** Where the gateway redirects the browser back to after checkout. */
  callbackUrl: string;
  metadata?: Record<string, unknown>;
}

export interface InitializeTransactionResult {
  checkoutUrl: string;
  reference: string;
}

export interface VerifyTransactionResult {
  success: boolean;
  reference: string;
  /** Major currency units, as a string, matching Subscription.amount's own representation. */
  amount: string;
  currency: string;
}
