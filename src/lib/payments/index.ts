import "server-only";

import * as paystack from "./paystack";
import * as flutterwave from "./flutterwave";
import type { GatewayProvider, InitializeTransactionInput, InitializeTransactionResult, VerifyTransactionResult } from "./types";

export type { GatewayProvider, InitializeTransactionInput, InitializeTransactionResult, VerifyTransactionResult };
export { isGatewayConfigured, configuredGatewayProviders } from "./config";

export function initializeTransaction(
  provider: GatewayProvider,
  input: InitializeTransactionInput,
): Promise<InitializeTransactionResult> {
  return provider === "PAYSTACK" ? paystack.initializeTransaction(input) : flutterwave.initializeTransaction(input);
}

export function verifyTransaction(provider: GatewayProvider, reference: string): Promise<VerifyTransactionResult> {
  return provider === "PAYSTACK" ? paystack.verifyTransaction(reference) : flutterwave.verifyTransaction(reference);
}

export { verifySignature as verifyPaystackSignature } from "./paystack";
export { verifyWebhookHash as verifyFlutterwaveWebhookHash } from "./flutterwave";
