import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = {
  user: { findUnique: vi.fn(), update: vi.fn() },
  organizationMember: { findFirst: vi.fn() },
};
const mockIssuePasswordResetToken = vi.fn();
const mockSendEmail = vi.fn();
let mockHost = "app.rockfrostgroup.com";

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
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: mockHost }),
}));
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
  vi.stubEnv("PLATFORM_APP_URL", "https://admin.rockfrostgroup.com");
  vi.stubEnv("TENANT_APP_URL", "https://app.rockfrostgroup.com");
  mockHost = "app.rockfrostgroup.com";
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
          "https://app.rockfrostgroup.com/reset-password?email=person%2Bops%40example.com&token=token%26one",
        ),
      }),
    );
  });

  it("keeps a platform owner's password-reset flow on the admin host", async () => {
    mockHost = "admin.rockfrostgroup.com";
    mockDb.user.findUnique.mockResolvedValue({ id: "owner-1", email: "owner@example.com", status: "ACTIVE" });
    mockIssuePasswordResetToken.mockResolvedValue("owner-token");
    mockSendEmail.mockResolvedValue({ ok: true });

    const formData = new FormData();
    formData.set("email", "owner@example.com");

    await expect(requestPasswordReset(formData)).rejects.toThrow("/forgot-password?sent=1");
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining(
          "https://admin.rockfrostgroup.com/reset-password?email=owner%40example.com&token=owner-token",
        ),
      }),
    );
  });
});
