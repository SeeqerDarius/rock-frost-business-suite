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

async function paystackRequest(path: string, init: RequestInit = {}) {
  const secretKey = getSecretKey();
  if (!secretKey) throw new Error("Paystack is not configured (PAYSTACK_SECRET_KEY unset).");
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.status) {
    throw new Error(`Paystack request failed: ${body?.message ?? response.statusText}`);
  }
  return body.data;
}

export type PaystackPlanInterval = "monthly" | "quarterly" | "biannually" | "annually";

export async function createPlan(input: { name: string; amount: string; currency: string; interval: PaystackPlanInterval }): Promise<string> {
  const data = await paystackRequest("/plan", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      amount: toSubunits(input.amount),
      currency: input.currency,
      interval: input.interval,
      invoice_limit: 0,
      send_invoices: true,
      send_sms: false,
      description: "Rock Frost Business Suite automatic module renewal",
    }),
  });
  if (!data?.plan_code) throw new Error("Paystack plan creation did not return a plan code.");
  return String(data.plan_code);
}

export async function getSubscriptionManagementLink(subscriptionCode: string): Promise<string> {
  const data = await paystackRequest(`/subscription/${encodeURIComponent(subscriptionCode)}/manage/link`);
  if (!data?.link) throw new Error("Paystack did not return a subscription management link.");
  return String(data.link);
}

export async function disableSubscription(code: string, token: string): Promise<void> {
  await paystackRequest("/subscription/disable", {
    method: "POST",
    body: JSON.stringify({ code, token }),
  });
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
      ...(input.planCode ? { plan: input.planCode } : {}),
      ...(input.subaccountCode ? { subaccount: input.subaccountCode } : {}),
      ...(input.transactionCharge != null ? { transaction_charge: input.transactionCharge } : {}),
      ...(input.bearer ? { bearer: input.bearer } : {}),
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
  const result: VerifyTransactionResult = {
    success: data.status === "success",
    reference: data.reference,
    amount: fromSubunits(Number(data.amount)),
    currency: String(data.currency ?? "").toUpperCase(),
  };
  if (typeof data.paid_at === "string") result.paidAt = new Date(data.paid_at);
  if (typeof data.channel === "string") result.channel = data.channel;
  if (typeof data.subaccount?.subaccount_code === "string") result.subaccountCode = data.subaccount.subaccount_code;
  return result;
}

export async function listBanks(country = "ghana") {
  return paystackRequest(`/bank?country=${encodeURIComponent(country)}&perPage=100`);
}

export async function resolveAccountNumber(accountNumber: string, bankCode: string): Promise<{ accountName: string; accountNumber: string }> {
  const data = await paystackRequest(`/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`);
  return { accountName: String(data.account_name), accountNumber: String(data.account_number) };
}

export async function createSubaccount(input: { businessName: string; bankCode: string; accountNumber: string; percentageCharge?: number }) {
  const data = await paystackRequest("/subaccount", {
    method: "POST",
    body: JSON.stringify({ business_name: input.businessName, settlement_bank: input.bankCode, account_number: input.accountNumber, percentage_charge: input.percentageCharge ?? 0 }),
  });
  if (!data?.subaccount_code) throw new Error("Paystack did not return a settlement account reference.");
  return { subaccountCode: String(data.subaccount_code), accountName: String(data.account_name ?? input.businessName), bankName: String(data.settlement_bank ?? input.bankCode) };
}

export async function updateSubaccount(subaccountCode: string, input: { businessName: string; bankCode: string; accountNumber: string }) {
  const data = await paystackRequest(`/subaccount/${encodeURIComponent(subaccountCode)}`, {
    method: "PUT",
    body: JSON.stringify({ business_name: input.businessName, settlement_bank: input.bankCode, account_number: input.accountNumber, active: true }),
  });
  return { subaccountCode: String(data.subaccount_code ?? subaccountCode), accountName: String(data.account_name ?? input.businessName), bankName: String(data.settlement_bank ?? input.bankCode) };
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
