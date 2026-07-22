import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = {
  user: { findUnique: vi.fn(), update: vi.fn() },
  organizationMember: { findFirst: vi.fn() },
};
const mockIssuePasswordResetToken = vi.fn();
const mockSendEmail = vi.fn();

class RedirectSignal extends Error {
  constructor(public url: string) {
    super(`redirect:${url}`);
  }
}

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/email", () => ({ sendEmail: mockSendEmail }));
vi.mock("@/lib/auth/tokens", () => ({
  issuePasswordResetToken: mockIssuePasswordResetToken,
  consumePasswordResetToken: vi.fn(),
}));
vi.mock("@/lib/auth/session-revocation", () => ({ revokeUserSessions: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getServerAuthSession: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAuditEvent: vi.fn() }));
vi.mock("@/lib/auth/invitations", () => ({
  acceptInvitationNewUser: vi.fn(),
  acceptInvitationExistingUser: vi.fn(),
  InvitationAcceptError: class InvitationAcceptError extends Error {},
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectSignal(url);
  },
}));

const { requestPasswordReset } = await import("@/lib/auth/actions");

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXTAUTH_URL", "https://www.rockfrostgroup.com");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
  vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
  vi.stubEnv("VERCEL_URL", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("authentication email links", () => {
  it("sends an active user a canonical, safely encoded password-reset URL", async () => {
    mockDb.user.findUnique.mockResolvedValue({ id: "user-1", email: "person+ops@example.com", status: "ACTIVE" });
    mockIssuePasswordResetToken.mockResolvedValue("token&one");
    mockSendEmail.mockResolvedValue({ ok: true });

    const formData = new FormData();
    formData.set("email", "person+ops@example.com");

    await expect(requestPasswordReset(formData)).rejects.toThrow("/forgot-password?sent=1");
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining(
          "https://www.rockfrostgroup.com/reset-password?email=person%2Bops%40example.com&token=token%26one",
        ),
      }),
    );
  });
});
