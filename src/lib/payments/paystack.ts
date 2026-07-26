import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import type { InitializeTransactionInput, InitializeTransactionResult, VerifyTransactionResult } from "./types";

const API_BASE = "https://api.paystack.co";

function getSecretKey(): string | null {
  return process.env.PAYSTACK_SECRET_KEY?.trim() || null;
}

/** Paystack expects the smallest currency subunit (e.g. pesewas for GHS, kobo for NGN) — always whole numbers. */
function toSubunits(amount: string): number {
  return Math.round(Number(amount) * 100);
}

function fromSubunits(subunits: number): string {
  return (subunits / 100).toFixed(2);
}

export async function initializeTransaction(input: InitializeTransactionInput): Promise<InitializeTransactionResult> {
  const secretKey = getSecretKey();
  if (!secretKey) throw new Error("Paystack is not configured (PAYSTACK_SECRET_KEY unset).");

  const response = await fetch(`${API_BASE}/transaction/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      reference: input.reference,
      amount: toSubunits(input.amount),
      email: input.customerEmail,
      currency: input.currency,
      callback_url: input.callbackUrl,
      metadata: input.metadata ?? {},
    }),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.status || !body?.data?.authorization_url) {
    throw new Error(`Paystack transaction initialization failed: ${body?.message ?? response.statusText}`);
  }

  return { checkoutUrl: body.data.authorization_url, reference: body.data.reference ?? input.reference };
}

export async function verifyTransaction(reference: string): Promise<VerifyTransactionResult> {
  const secretKey = getSecretKey();
  if (!secretKey) throw new Error("Paystack is not configured (PAYSTACK_SECRET_KEY unset).");

  const response = await fetch(`${API_BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.status || !body?.data) {
    throw new Error(`Paystack transaction verification failed: ${body?.message ?? response.statusText}`);
  }

  const data = body.data;
  return {
    success: data.status === "success",
    reference: data.reference,
    amount: fromSubunits(Number(data.amount)),
    currency: String(data.currency ?? "").toUpperCase(),
  };
}

/**
 * Verifies Paystack's webhook signature — HMAC-SHA512 of the raw request
 * body, keyed by the same secret key used for API calls. Must run against
 * the raw (unparsed) body text, not a re-serialized JSON.stringify of the
 * parsed payload, since re-serialization can change byte-for-byte formatting
 * and break the comparison.
 */
export function verifySignature(rawBody: string, signatureHeader: string | null | undefined): boolean {
  const secretKey = getSecretKey();
  if (!secretKey || !signatureHeader) return false;

  const expected = createHmac("sha512", secretKey).update(rawBody).digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const providedBuffer = Buffer.from(signatureHeader, "hex");
  if (expectedBuffer.length !== providedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, providedBuffer);
}
