import "server-only";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { db } from "@/lib/db";

export type RateLimitTier = "auth" | "general";

const TIERS: Record<RateLimitTier, { windowMs: number; cap: number }> = {
  // Pre-authentication paths (NextAuth's own route, login/forgot-password/
  // reset-password/invite form submissions). Keyed by IP since there's no
  // session yet - a second, IP-based layer on top of the existing
  // per-account failedLoginAttempts lockout, which does nothing to slow a
  // credential-stuffing pass across many different accounts from one IP.
  auth: { windowMs: 5 * 60 * 1000, cap: 30 },
  // Everything else in scope (every other API route, every Server Action).
  // 300/min gives 4-6x headroom over the measured real-world ceiling of a
  // signed-in user polling support chat/notifications across a few open
  // tabs (~50-70/min), while still cutting off a sustained scripted burst
  // within the same minute it starts.
  general: { windowMs: 60 * 1000, cap: 300 },
};

async function resolveIdentity(request: NextRequest): Promise<string> {
  try {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
      secureCookie: process.env.NODE_ENV === "production",
    });
    if (token?.user?.id) return `user:${token.user.id}`;
  } catch {
    // Fall through to IP - an undecodable/expired token is not a reason to
    // skip rate limiting, just a reason to key it by IP instead.
  }
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return `ip:${forwardedFor ?? "unknown"}`;
}

async function incrementBucket(key: string, windowMs: number): Promise<number> {
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimitBucket" ("key", "windowStart", "count", "updatedAt")
    VALUES (${key}, now(), 1, now())
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimitBucket"."windowStart" <= now() - (${windowMs}::integer * interval '1 millisecond')
                     THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
      "windowStart" = CASE WHEN "RateLimitBucket"."windowStart" <= now() - (${windowMs}::integer * interval '1 millisecond')
                     THEN now() ELSE "RateLimitBucket"."windowStart" END,
      "updatedAt" = now()
    RETURNING "count"
  `;
  return rows[0]?.count ?? 1;
}

function tooManyRequests(retryAfterSeconds: number, isApiRoute: boolean): NextResponse {
  const headers = { "Retry-After": String(retryAfterSeconds) };
  if (isApiRoute) {
    return NextResponse.json(
      { error: "rate_limited", message: "Too many requests. Please slow down and try again shortly." },
      { status: 429, headers },
    );
  }
  // A Server Action's error-response handling (traced in this exact
  // installed Next.js version's client source) surfaces the response body
  // verbatim as the thrown Error's message only when the status is >= 400
  // and Content-Type is the literal string "text/plain" (no charset
  // suffix) - any other shape falls back to a generic message. Either way
  // src/app/app/error.tsx catches the resulting thrown error.
  return new NextResponse("Too many requests. Please wait a moment and try again.", {
    status: 429,
    headers: { ...headers, "Content-Type": "text/plain" },
  });
}

/**
 * Centralized rate-limit check called from src/proxy.ts for every API route
 * and Server Action. Never throws - a failure to check or record a rate
 * limit must never break the real request it's guarding, so any error here
 * (a DB hiccup, a migration not yet applied in some environment) is logged
 * and the request is allowed through. This is deliberate defense-in-depth,
 * not this app's primary security boundary (unlike tenant scoping or the
 * per-account login lockout, which stay fail-closed) - failing closed here
 * would mean one transient DB error takes down every API route and every
 * Server Action in the app at once, an outsized blast radius for a rate
 * limiter. Mirrors the same fail-open philosophy already stated for audit
 * logging in src/lib/audit.ts.
 */
export async function checkRateLimit(
  request: NextRequest,
  options: { tier: RateLimitTier; isApiRoute: boolean },
): Promise<NextResponse | null> {
  const { windowMs, cap } = TIERS[options.tier];
  try {
    const identity = await resolveIdentity(request);
    const key = `${options.tier}:${identity}`;
    const count = await incrementBucket(key, windowMs);
    if (count > cap) {
      return tooManyRequests(Math.ceil(windowMs / 1000), options.isApiRoute);
    }
  } catch (error) {
    console.warn("[rate-limit] check failed, allowing request through", {
      tier: options.tier,
      pathname: request.nextUrl.pathname,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return null;
}
