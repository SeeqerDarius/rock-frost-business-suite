import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Regression test for a production login outage: neither TURNSTILE_SECRET_KEY
 * nor NEXT_PUBLIC_TURNSTILE_SITE_KEY was set in production, so
 * TurnstileWidget rendered nothing client-side (no token was ever produced)
 * while verifyBotProtection() still failed closed server-side whenever
 * NODE_ENV === "production" - every sign-in attempt was rejected with
 * "We couldn't verify this sign-in attempt," regardless of a correct
 * password. Real credential verification and per-account rate limiting
 * (failedLoginAttempts / lockedUntil) do not depend on Turnstile and are
 * unaffected by this fix; only the bot-check gate itself no longer hard-fails
 * when Turnstile is not configured at all.
 */

const mockDb = { user: { findUnique: vi.fn() } };
class RedirectSignal extends Error {
  constructor(public url: string) {
    super(`redirect:${url}`);
  }
}

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/email-templates", () => ({ passwordResetEmail: vi.fn() }));
vi.mock("@/lib/auth/tokens", () => ({ issuePasswordResetToken: vi.fn(), consumePasswordResetToken: vi.fn() }));
vi.mock("@/lib/auth/session-revocation", () => ({ revokeUserSessions: vi.fn() }));
vi.mock("@/lib/auth/invitations", () => ({
  acceptInvitationNewUser: vi.fn(),
  acceptInvitationExistingUser: vi.fn(),
  InvitationAcceptError: class extends Error {},
}));
vi.mock("@/lib/auth/session", () => ({ getServerAuthSession: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAuditEvent: vi.fn() }));
vi.mock("@/lib/app-surfaces", () => ({ buildSurfaceUrl: vi.fn(), classifyAppSurface: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectSignal(url);
  },
}));

const { verifyLoginBotProtection, requestPasswordReset } = await import("@/lib/auth/actions");

function formData(fields: Record<string, string> = {}) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.TURNSTILE_SECRET_KEY;
  delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  mockDb.user.findUnique.mockResolvedValue(null);
});

describe("verifyLoginBotProtection", () => {
  it("allows sign-in when Turnstile is not configured, instead of failing every attempt closed", async () => {
    await expect(verifyLoginBotProtection(formData())).resolves.toBe(true);
  });

  it("still requires a valid Turnstile token when Turnstile is configured", async () => {
    process.env.TURNSTILE_SECRET_KEY = "secret";
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "site-key";
    await expect(verifyLoginBotProtection(formData())).resolves.toBe(false);
  });
});

describe("requestPasswordReset bot-check gate", () => {
  it("does not redirect to the bot-check error page when Turnstile is not configured", async () => {
    await expect(requestPasswordReset(formData({ email: "not-an-email" }))).rejects.toMatchObject({ url: "/forgot-password?sent=1" });
  });

  it("redirects to the bot-check error page when Turnstile is configured but no token was supplied", async () => {
    process.env.TURNSTILE_SECRET_KEY = "secret";
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "site-key";
    await expect(requestPasswordReset(formData({ email: "someone@example.com" }))).rejects.toMatchObject({ url: "/forgot-password?error=bot-check" });
  });
});
