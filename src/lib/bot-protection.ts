import "server-only";

import { headers } from "next/headers";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

type TurnstileResponse = {
  success?: boolean;
  action?: string;
  hostname?: string;
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
    if (!response.ok) return false;
    const result = await response.json() as TurnstileResponse;
    return result.success === true && (!result.action || result.action === expectedAction);
  } catch {
    return false;
  }
}
