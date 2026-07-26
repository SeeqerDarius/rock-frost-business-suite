import "server-only";

import { timingSafeEqual } from "node:crypto";
import type { InitializeTransactionInput, InitializeTransactionResult, VerifyTransactionResult } from "./types";

const API_BASE = "https://api.flutterwave.com/v3";

function getSecretKey(): string | null {
  return process.env.FLUTTERWAVE_SECRET_KEY?.trim() || null;
}

export async function initializeTransaction(input: InitializeTransactionInput): Promise<InitializeTransactionResult> {
  const secretKey = getSecretKey();
  if (!secretKey) throw new Error("Flutterwave is not configured (FLUTTERWAVE_SECRET_KEY unset).");

  const response = await fetch(`${API_BASE}/payments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      tx_ref: input.reference,
      // Flutterwave takes the amount in major currency units (not subunits) — unlike Paystack.
      amount: input.amount,
      currency: input.currency,
      redirect_url: input.callbackUrl,
      customer: { email: input.customerEmail },
      meta: input.metadata ?? {},
    }),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok || body?.status !== "success" || !body?.data?.link) {
    throw new Error(`Flutterwave transaction initialization failed: ${body?.message ?? response.statusText}`);
  }

  return { checkoutUrl: body.data.link, reference: input.reference };
}

export async function verifyTransaction(reference: string): Promise<VerifyTransactionResult> {
  const secretKey = getSecretKey();
  if (!secretKey) throw new Error("Flutterwave is not configured (FLUTTERWAVE_SECRET_KEY unset).");

  const response = await fetch(
    `${API_BASE}/transactions/verify_by_reference?tx_ref=${encodeURIComponent(reference)}`,
    { headers: { Authorization: `Bearer ${secretKey}` } },
  );
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.status !== "success" || !body?.data) {
    throw new Error(`Flutterwave transaction verification failed: ${body?.message ?? response.statusText}`);
  }

  const data = body.data;
  return {
    success: data.status === "successful",
    reference: data.tx_ref,
    amount: Number(data.amount).toFixed(2),
    currency: String(data.currency ?? "").toUpperCase(),
  };
}

/**
 * Flutterwave webhooks carry a shared-secret string in the `verif-hash`
 * header (configured in the dashboard alongside FLUTTERWAVE_WEBHOOK_HASH
 * here) rather than an HMAC signature — a direct constant-time string
 * comparison, not a digest.
 */
export function verifyWebhookHash(headerValue: string | null | undefined): boolean {
  const expected = process.env.FLUTTERWAVE_WEBHOOK_HASH?.trim();
  if (!expected || !headerValue) return false;

  const expectedBuffer = Buffer.from(expected, "utf8");
  const providedBuffer = Buffer.from(headerValue, "utf8");
  if (expectedBuffer.length !== providedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, providedBuffer);
}
