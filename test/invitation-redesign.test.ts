import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = {
  invitation: {
    upsert: vi.fn(),
    updateMany: vi.fn(),
    update: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
  },
  user: { update: vi.fn() },
  organizationMember: { update: vi.fn(), updateMany: vi.fn() },
  $transaction: vi.fn(),
};

vi.mock("@/lib/db", () => ({ db: mockDb }));

function txPassthrough() {
  mockDb.$transaction.mockImplementation(async (fn: (tx: typeof mockDb) => Promise<unknown>) => fn(mockDb));
}

const invitations = await import("@/lib/auth/invitations");

const ORG = "org-1";
const MEMBERSHIP = "mem-1";

beforeEach(() => {
  vi.clearAllMocks();
  txPassthrough();
});

/**
 * Regression tests for docs/HARDENING_PLAN.md's invitation redesign: the
 * previous email-keyed VerificationToken design let accepting one invite
 * activate every INVITED membership for that user, and unconditionally
 * replaced an existing active user's password. The Invitation model binds
 * one token to one specific membership, closing both.
 */
describe("acceptInvitationNewUser — binds to one membership, never touches an active user's password", () => {
  function invitationRow(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: "inv-1",
      membershipId: MEMBERSHIP,
      status: "PENDING",
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      membership: {
        userId: "user-1",
        organizationId: ORG,
        user: { id: "user-1", status: "INVITED" },
        organization: { name: "Acme Co" },
      },
      ...overrides,
    };
  }

  it("activates only the membership the invitation was issued for", async () => {
    mockDb.invitation.findUnique.mockResolvedValue(invitationRow());

    await invitations.acceptInvitationNewUser("raw-token", "hashed-pw");

    // The fix: a scoped update() by this exact membershipId, never an
    // updateMany across every INVITED membership for the user.
    expect(mockDb.organizationMember.update).toHaveBeenCalledWith({
      where: { id: MEMBERSHIP },
      data: { status: "ACTIVE", joinedAt: expect.any(Date) },
    });
    expect(mockDb.organizationMember.updateMany).not.toHaveBeenCalled();
  });

  it("rejects when the underlying user is already ACTIVE, never touching their password", async () => {
    mockDb.invitation.findUnique.mockResolvedValue(
      invitationRow({ membership: { userId: "user-1", organizationId: ORG, user: { id: "user-1", status: "ACTIVE" }, organization: { name: "Acme Co" } } }),
    );

    await expect(invitations.acceptInvitationNewUser("raw-token", "hashed-pw")).rejects.toThrow(
      invitations.InvitationAcceptError,
    );
    expect(mockDb.user.update).not.toHaveBeenCalled();
  });

  it("rejects an already-accepted invitation", async () => {
    mockDb.invitation.findUnique.mockResolvedValue(invitationRow({ status: "ACCEPTED" }));
    await expect(invitations.acceptInvitationNewUser("raw-token", "hashed-pw")).rejects.toThrow(
      invitations.InvitationAcceptError,
    );
  });

  it("rejects a revoked invitation", async () => {
    mockDb.invitation.findUnique.mockResolvedValue(invitationRow({ status: "REVOKED" }));
    await expect(invitations.acceptInvitationNewUser("raw-token", "hashed-pw")).rejects.toThrow(
      invitations.InvitationAcceptError,
    );
  });

  it("rejects an expired invitation", async () => {
    mockDb.invitation.findUnique.mockResolvedValue(invitationRow({ expiresAt: new Date(Date.now() - 1000) }));
    await expect(invitations.acceptInvitationNewUser("raw-token", "hashed-pw")).rejects.toThrow(
      invitations.InvitationAcceptError,
    );
  });

  it("rejects an unknown token without revealing whether it ever existed", async () => {
    mockDb.invitation.findUnique.mockResolvedValue(null);
    await expect(invitations.acceptInvitationNewUser("raw-token", "hashed-pw")).rejects.toThrow(
      invitations.InvitationAcceptError,
    );
  });
});

describe("acceptInvitationExistingUser — never sets a password, requires the matching signed-in account", () => {
  function invitationRow() {
    return {
      id: "inv-1",
      membershipId: MEMBERSHIP,
      status: "PENDING",
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      membership: {
        userId: "user-1",
        organizationId: ORG,
        user: { id: "user-1", status: "ACTIVE" },
        organization: { name: "Acme Co" },
      },
    };
  }

  it("activates the membership without ever calling user.update (no password touched)", async () => {
    mockDb.invitation.findUnique.mockResolvedValue(invitationRow());

    await invitations.acceptInvitationExistingUser("raw-token", "user-1");

    expect(mockDb.organizationMember.update).toHaveBeenCalledWith({
      where: { id: MEMBERSHIP },
      data: { status: "ACTIVE", joinedAt: expect.any(Date) },
    });
    expect(mockDb.user.update).not.toHaveBeenCalled();
  });

  it("rejects when the signed-in session belongs to a different account", async () => {
    mockDb.invitation.findUnique.mockResolvedValue(invitationRow());

    await expect(invitations.acceptInvitationExistingUser("raw-token", "some-other-user")).rejects.toThrow(
      invitations.InvitationAcceptError,
    );
    expect(mockDb.organizationMember.update).not.toHaveBeenCalled();
  });

  it("rejects when the target user is not actually ACTIVE (defense in depth)", async () => {
    mockDb.invitation.findUnique.mockResolvedValue({
      id: "inv-1",
      membershipId: MEMBERSHIP,
      status: "PENDING",
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      membership: {
        userId: "user-1",
        organizationId: ORG,
        user: { id: "user-1", status: "INVITED" },
        organization: { name: "Acme Co" },
      },
    });

    await expect(invitations.acceptInvitationExistingUser("raw-token", "user-1")).rejects.toThrow(
      invitations.InvitationAcceptError,
    );
  });
});

describe("revokeInvitation / resendInvitation — atomic claims, basic rate limiting", () => {
  it("revokeInvitation throws when the atomic PENDING->REVOKED claim matches zero rows (already resolved)", async () => {
    mockDb.invitation.findFirst.mockResolvedValue({ id: "inv-1", status: "ACCEPTED" });
    mockDb.invitation.updateMany.mockResolvedValue({ count: 0 });

    await expect(invitations.revokeInvitation(ORG, MEMBERSHIP)).rejects.toThrow(invitations.InvitationError);
  });

  it("revokeInvitation succeeds when the claim matches one row", async () => {
    mockDb.invitation.findFirst.mockResolvedValue({ id: "inv-1", status: "PENDING" });
    mockDb.invitation.updateMany.mockResolvedValue({ count: 1 });

    await invitations.revokeInvitation(ORG, MEMBERSHIP);
    expect(mockDb.invitation.updateMany).toHaveBeenCalledWith({ where: { id: "inv-1", status: "PENDING" }, data: { status: "REVOKED" } });
  });

  it("resendInvitation rejects a resend within the cooldown window", async () => {
    mockDb.invitation.findFirst.mockResolvedValue({
      id: "inv-1",
      status: "PENDING",
      lastSentAt: new Date(), // just sent
    });

    await expect(invitations.resendInvitation(ORG, MEMBERSHIP)).rejects.toThrow(invitations.InvitationError);
    expect(mockDb.invitation.update).not.toHaveBeenCalled();
  });

  it("resendInvitation issues a fresh token once the cooldown has passed", async () => {
    mockDb.invitation.findFirst.mockResolvedValue({
      id: "inv-1",
      status: "PENDING",
      lastSentAt: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
    });
    mockDb.invitation.update.mockResolvedValue({});

    const token = await invitations.resendInvitation(ORG, MEMBERSHIP);
    expect(typeof token).toBe("string");
    expect(mockDb.invitation.update).toHaveBeenCalled();
  });
});
