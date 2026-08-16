import "server-only";

import { headers } from "next/headers";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

type TurnstileResponse = {
  success?: boolean;
  action?: string;
  hostname?: string;
  "error-codes"?: string[];
};

export function isBotProtectionConfigured() {
  return Boolean(process.env.TURNSTILE_SECRET_KEY && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
}

export async function verifyBotProtection(token: FormDataEntryValue | null, expectedAction: string) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return process.env.NODE_ENV !== "production";
  if (typeof token !== "string" || !token.trim()) return false;

  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
  const body = new URLSearchParams({ secret, response: token });
  if (forwardedFor) body.set("remoteip", forwardedFor);

  try {
    const response = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      console.warn("[bot-protection] Turnstile verification request failed", {
        expectedAction,
        status: response.status,
      });
      return false;
    }
    const result = await response.json() as TurnstileResponse;
    const verified = result.success === true && (!result.action || result.action === expectedAction);
    if (!verified) {
      console.warn("[bot-protection] Turnstile rejected a submission", {
        expectedAction,
        returnedAction: result.action ?? null,
        hostname: result.hostname ?? null,
        errorCodes: result["error-codes"] ?? [],
      });
    }
    return verified;
  } catch (error) {
    console.warn("[bot-protection] Turnstile verification was unavailable", {
      expectedAction,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
