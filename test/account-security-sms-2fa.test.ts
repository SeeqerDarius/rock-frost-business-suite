import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = {
  user: { findUnique: vi.fn(), update: vi.fn() },
  organizationMember: { findFirst: vi.fn() },
};
const mockLogAuditEvent = vi.fn();
const mockGetServerAuthSession = vi.fn();
const mockRevokeUserSessions = vi.fn();
const mockVerifyCurrentPassword = vi.fn();
const mockIssueSmsOtpChallenge = vi.fn();
const mockConsumeSmsOtpChallenge = vi.fn();

class RedirectSignal extends Error {
  constructor(public url: string) {
    super(`redirect:${url}`);
  }
}

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/audit", () => ({ logAuditEvent: mockLogAuditEvent }));
vi.mock("@/lib/auth/session", () => ({ getServerAuthSession: mockGetServerAuthSession }));
vi.mock("@/lib/auth/session-revocation", () => ({ revokeUserSessions: mockRevokeUserSessions }));
vi.mock("@/lib/auth/verify-password", () => ({ verifyCurrentPassword: mockVerifyCurrentPassword }));
vi.mock("@/lib/auth/sms-otp", () => ({
  issueSmsOtpChallenge: mockIssueSmsOtpChallenge,
  consumeSmsOtpChallenge: mockConsumeSmsOtpChallenge,
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ referer: "https://app.rockfrostgroup.com/app/account/security" }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectSignal(url);
  },
}));

const { beginSmsTwoFactorSetup, confirmSmsTwoFactorSetup, requestDisableSmsCode, disableTwoFactor } = await import(
  "@/app/app/(overview)/account/security/actions"
);

beforeEach(() => {
  vi.clearAllMocks();
  mockGetServerAuthSession.mockResolvedValue({ user: { id: "user-1" } });
  mockVerifyCurrentPassword.mockResolvedValue(true);
});

function formWith(fields: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return formData;
}

describe("beginSmsTwoFactorSetup", () => {
  it("rejects a wrong current password before doing anything else", async () => {
    mockVerifyCurrentPassword.mockResolvedValue(false);
    await expect(beginSmsTwoFactorSetup(formWith({ currentPassword: "wrong", phone: "0241234567" }))).rejects.toThrow(
      "/app/account/security?error=password",
    );
    expect(mockIssueSmsOtpChallenge).not.toHaveBeenCalled();
  });

  it("refuses to start a second method while 2FA is already active", async () => {
    mockDb.user.findUnique.mockResolvedValue({ twoFactorEnabled: true });
    await expect(beginSmsTwoFactorSetup(formWith({ currentPassword: "correct", phone: "0241234567" }))).rejects.toThrow(
      "/app/account/security?error=already-enabled",
    );
  });

  it("rejects a phone number that can't be normalized to Ghana local format", async () => {
    mockDb.user.findUnique.mockResolvedValue({ twoFactorEnabled: false });
    await expect(beginSmsTwoFactorSetup(formWith({ currentPassword: "correct", phone: "not-a-phone" }))).rejects.toThrow(
      "/app/account/security?error=phone",
    );
    expect(mockIssueSmsOtpChallenge).not.toHaveBeenCalled();
  });

  it("sends an ENROLL_VERIFY_PHONE challenge to the entered (normalized) phone and redirects to the code step", async () => {
    mockDb.user.findUnique.mockResolvedValue({ twoFactorEnabled: false });
    mockDb.organizationMember.findFirst.mockResolvedValue({ organizationId: "org-1" });
    mockIssueSmsOtpChallenge.mockResolvedValue({ ok: true });

    await expect(beginSmsTwoFactorSetup(formWith({ currentPassword: "correct", phone: "024 123 4567" }))).rejects.toThrow(
      "/app/account/security?smsSetup=1",
    );

    expect(mockIssueSmsOtpChallenge).toHaveBeenCalledWith({
      userId: "user-1",
      organizationId: "org-1",
      purpose: "ENROLL_VERIFY_PHONE",
      phone: "0241234567",
    });
  });

  it("surfaces a distinct error when the SMS provider send fails", async () => {
    mockDb.user.findUnique.mockResolvedValue({ twoFactorEnabled: false });
    mockDb.organizationMember.findFirst.mockResolvedValue({ organizationId: "org-1" });
    mockIssueSmsOtpChallenge.mockResolvedValue({ ok: false, error: "SMS delivery is not configured yet." });

    await expect(beginSmsTwoFactorSetup(formWith({ currentPassword: "correct", phone: "0241234567" }))).rejects.toThrow(
      "/app/account/security?error=sms-failed",
    );
  });
});

describe("confirmSmsTwoFactorSetup", () => {
  it("rejects an invalid or expired code without touching the user record", async () => {
    mockConsumeSmsOtpChallenge.mockResolvedValue({ ok: false });
    await expect(confirmSmsTwoFactorSetup(formWith({ code: "000000" }))).rejects.toThrow(
      "/app/account/security?error=code",
    );
    expect(mockDb.user.update).not.toHaveBeenCalled();
  });

  it("activates SMS 2FA using the challenge's own phone, revokes sessions, and sends the user back to log in", async () => {
    mockConsumeSmsOtpChallenge.mockResolvedValue({ ok: true, phone: "0241234567" });

    await expect(confirmSmsTwoFactorSetup(formWith({ code: "123456" }))).rejects.toThrow("/login?security=2fa-enabled");

    expect(mockDb.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: expect.objectContaining({
        twoFactorMethod: "SMS",
        twoFactorPhone: "0241234567",
        twoFactorEnabled: true,
      }),
    });
    expect(mockRevokeUserSessions).toHaveBeenCalledWith("user-1", "two_factor_enabled");
  });
});

describe("requestDisableSmsCode", () => {
  it("refuses to send a disable code for an account that isn't on SMS 2FA", async () => {
    mockDb.user.findUnique.mockResolvedValue({ twoFactorEnabled: true, twoFactorMethod: "TOTP", twoFactorPhone: null });
    await expect(requestDisableSmsCode(formWith({ currentPassword: "correct" }))).rejects.toThrow(
      "/app/account/security?error=setup",
    );
    expect(mockIssueSmsOtpChallenge).not.toHaveBeenCalled();
  });

  it("sends a DISABLE challenge to the account's on-file 2FA phone", async () => {
    mockDb.user.findUnique.mockResolvedValue({ twoFactorEnabled: true, twoFactorMethod: "SMS", twoFactorPhone: "0241234567" });
    mockDb.organizationMember.findFirst.mockResolvedValue({ organizationId: "org-1" });
    mockIssueSmsOtpChallenge.mockResolvedValue({ ok: true });

    await expect(requestDisableSmsCode(formWith({ currentPassword: "correct" }))).rejects.toThrow(
      "/app/account/security?disableCodeSent=1",
    );

    expect(mockIssueSmsOtpChallenge).toHaveBeenCalledWith({
      userId: "user-1",
      organizationId: "org-1",
      purpose: "DISABLE",
      phone: "0241234567",
    });
  });
});

describe("disableTwoFactor — SMS branch", () => {
  it("verifies via the SMS challenge (not TOTP) when the account's active method is SMS", async () => {
    mockDb.user.findUnique.mockResolvedValue({ twoFactorSecret: null, twoFactorEnabled: true, twoFactorMethod: "SMS" });
    mockConsumeSmsOtpChallenge.mockResolvedValue({ ok: true, phone: "0241234567" });

    await expect(disableTwoFactor(formWith({ currentPassword: "correct", code: "123456" }))).rejects.toThrow(
      "/login?security=2fa-disabled",
    );

    expect(mockConsumeSmsOtpChallenge).toHaveBeenCalledWith("user-1", "DISABLE", "123456");
    expect(mockDb.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: expect.objectContaining({ twoFactorMethod: null, twoFactorPhone: null, twoFactorEnabled: false }),
    });
  });

  it("rejects a wrong SMS disable code and leaves 2FA enabled", async () => {
    mockDb.user.findUnique.mockResolvedValue({ twoFactorSecret: null, twoFactorEnabled: true, twoFactorMethod: "SMS" });
    mockConsumeSmsOtpChallenge.mockResolvedValue({ ok: false });

    await expect(disableTwoFactor(formWith({ currentPassword: "correct", code: "000000" }))).rejects.toThrow(
      "/app/account/security?error=code",
    );
    expect(mockDb.user.update).not.toHaveBeenCalled();
  });
});
