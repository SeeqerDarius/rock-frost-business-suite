import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";

const mockDb = {
  user: { findUnique: vi.fn(), update: vi.fn() },
};
const mockLogAuditEvent = vi.fn();
const mockIssueSmsOtpChallenge = vi.fn();

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/audit", () => ({ logAuditEvent: mockLogAuditEvent }));
vi.mock("@/lib/auth/sms-otp", () => ({ issueSmsOtpChallenge: mockIssueSmsOtpChallenge }));
vi.mock("@/lib/auth/session", () => ({ getServerAuthSession: vi.fn() }));
vi.mock("@/lib/auth/tokens", () => ({ issuePasswordResetToken: vi.fn(), consumePasswordResetToken: vi.fn() }));
vi.mock("@/lib/auth/session-revocation", () => ({ revokeUserSessions: vi.fn() }));
vi.mock("@/lib/auth/invitations", () => ({
  acceptInvitationNewUser: vi.fn(),
  acceptInvitationExistingUser: vi.fn(),
  InvitationAcceptError: class InvitationAcceptError extends Error {},
}));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const { requestLoginSmsCode } = await import("@/lib/auth/actions");

const PASSWORD_HASH = await bcrypt.hash("correct-password", 10);

function membership(organizationId = "org-1") {
  return [{ organizationId, createdAt: new Date() }];
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("requestLoginSmsCode", () => {
  it("returns the generic response for an unknown email without touching the DB update or SMS paths", async () => {
    mockDb.user.findUnique.mockResolvedValue(null);

    const result = await requestLoginSmsCode("nobody@example.com", "whatever");

    expect(result).toEqual({ locked: false, minutesLeft: 0 });
    expect(mockDb.user.update).not.toHaveBeenCalled();
    expect(mockIssueSmsOtpChallenge).not.toHaveBeenCalled();
  });

  it("reports lockout the same way getAccountLockStatus does, without sending a code", async () => {
    mockDb.user.findUnique.mockResolvedValue({
      id: "user-1",
      passwordHash: PASSWORD_HASH,
      status: "ACTIVE",
      lockedUntil: new Date(Date.now() + 5 * 60_000),
      failedLoginAttempts: 5,
      twoFactorEnabled: true,
      twoFactorMethod: "SMS",
      twoFactorPhone: "0241234567",
      organizationMemberships: membership(),
    });

    const result = await requestLoginSmsCode("owner@example.com", "correct-password");

    expect(result.locked).toBe(true);
    expect(result.minutesLeft).toBeGreaterThan(0);
    expect(mockIssueSmsOtpChallenge).not.toHaveBeenCalled();
  });

  it("increments the shared lockout counters on a wrong password but still returns the generic response", async () => {
    mockDb.user.findUnique.mockResolvedValue({
      id: "user-1",
      passwordHash: PASSWORD_HASH,
      status: "ACTIVE",
      lockedUntil: null,
      failedLoginAttempts: 2,
      twoFactorEnabled: true,
      twoFactorMethod: "SMS",
      twoFactorPhone: "0241234567",
      organizationMemberships: membership(),
    });

    const result = await requestLoginSmsCode("owner@example.com", "wrong-password");

    expect(result).toEqual({ locked: false, minutesLeft: 0 });
    expect(mockDb.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { failedLoginAttempts: 3, lockedUntil: null },
    });
    expect(mockIssueSmsOtpChallenge).not.toHaveBeenCalled();
  });

  it("never sends a code for a correct password on a TOTP (non-SMS) account, but still returns the same generic response", async () => {
    mockDb.user.findUnique.mockResolvedValue({
      id: "user-1",
      passwordHash: PASSWORD_HASH,
      status: "ACTIVE",
      lockedUntil: null,
      failedLoginAttempts: 0,
      twoFactorEnabled: true,
      twoFactorMethod: "TOTP",
      twoFactorPhone: null,
      organizationMemberships: membership(),
    });

    const result = await requestLoginSmsCode("owner@example.com", "correct-password");

    expect(result).toEqual({ locked: false, minutesLeft: 0 });
    expect(mockIssueSmsOtpChallenge).not.toHaveBeenCalled();
  });

  it("sends a login code for a correct password on an SMS-2FA account", async () => {
    mockDb.user.findUnique.mockResolvedValue({
      id: "user-1",
      passwordHash: PASSWORD_HASH,
      status: "ACTIVE",
      lockedUntil: null,
      failedLoginAttempts: 0,
      twoFactorEnabled: true,
      twoFactorMethod: "SMS",
      twoFactorPhone: "0241234567",
      organizationMemberships: membership("org-1"),
    });
    mockIssueSmsOtpChallenge.mockResolvedValue({ ok: true });

    const result = await requestLoginSmsCode("owner@example.com", "correct-password");

    expect(result).toEqual({ locked: false, minutesLeft: 0 });
    expect(mockIssueSmsOtpChallenge).toHaveBeenCalledWith({
      userId: "user-1",
      organizationId: "org-1",
      purpose: "LOGIN",
      phone: "0241234567",
    });
  });
});
