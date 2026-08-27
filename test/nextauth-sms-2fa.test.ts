import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = {
  user: { findUnique: vi.fn(), update: vi.fn() },
};
const mockConsumeSmsOtpChallenge = vi.fn();
const mockLogAuditEvent = vi.fn();

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/audit", () => ({ logAuditEvent: mockLogAuditEvent }));
vi.mock("@/lib/auth/sms-otp", () => ({ consumeSmsOtpChallenge: mockConsumeSmsOtpChallenge }));
vi.mock("bcryptjs", () => ({ default: { compare: vi.fn().mockResolvedValue(true) } }));

const { authOptions } = await import("@/lib/auth/nextauth");
/**
 * This installed next-auth version's CredentialsProvider() factory doesn't
 * preserve the app's authorize() as the provider's own `.authorize` - that
 * property is hardcoded to a `() => null` stub, and the real function this
 * app defined only survives under `.options.authorize` (NextAuth's core
 * presumably reads it from there during its own internal init). Confirmed
 * by reading node_modules/next-auth/providers/credentials.js directly.
 */
const authorize = (authOptions.providers[0] as unknown as {
  options: {
    authorize: (
      credentials: { email?: string; password?: string; twoFactorCode?: string } | undefined,
      request: { headers?: Record<string, string> },
    ) => Promise<unknown>;
  };
}).options.authorize;

const baseUser = {
  id: "user-1",
  email: "owner@example.com",
  passwordHash: "hash",
  status: "ACTIVE",
  lockedUntil: null,
  failedLoginAttempts: 0,
  sessionVersion: 0,
  twoFactorEnabled: true,
  twoFactorMethod: "SMS",
  twoFactorSecret: null,
  organizationMemberships: [
    {
      organizationId: "org-1",
      role: { name: "Owner", isSystem: false, organizationId: "org-1" },
      status: "ACTIVE",
      organization: { status: "ACTIVE" },
      createdAt: new Date(),
    },
  ],
};

const request = { headers: { host: "app.rockfrostgroup.com" } };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("TENANT_APP_URL", "https://app.rockfrostgroup.com");
  vi.stubEnv("PLATFORM_APP_URL", "https://admin.rockfrostgroup.com");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.rockfrostgroup.com");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("nextauth authorize() — SMS 2FA branch", () => {
  it("signs in when the SMS code is consumed successfully", async () => {
    mockDb.user.findUnique.mockResolvedValue(baseUser);
    mockConsumeSmsOtpChallenge.mockResolvedValue({ ok: true, phone: "0241234567" });

    const result = await authorize({ email: "owner@example.com", password: "password", twoFactorCode: "123456" }, request);

    expect(mockConsumeSmsOtpChallenge).toHaveBeenCalledWith("user-1", "LOGIN", "123456");
    expect(result).toMatchObject({ id: "user-1", email: "owner@example.com" });
  });

  it("rejects sign-in and counts the attempt toward lockout when the SMS code is wrong", async () => {
    mockDb.user.findUnique.mockResolvedValue(baseUser);
    mockConsumeSmsOtpChallenge.mockResolvedValue({ ok: false });

    const result = await authorize({ email: "owner@example.com", password: "password", twoFactorCode: "000000" }, request);

    expect(result).toBeNull();
    expect(mockDb.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: expect.objectContaining({ failedLoginAttempts: 1 }),
    });
  });

  it("never calls consumeSmsOtpChallenge for a TOTP-method account", async () => {
    mockDb.user.findUnique.mockResolvedValue({
      ...baseUser,
      twoFactorMethod: "TOTP",
      twoFactorSecret: "encrypted-secret",
    });

    await authorize({ email: "owner@example.com", password: "password", twoFactorCode: "000000" }, request);

    expect(mockConsumeSmsOtpChallenge).not.toHaveBeenCalled();
  });
});
