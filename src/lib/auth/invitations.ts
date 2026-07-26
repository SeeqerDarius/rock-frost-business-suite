import "server-only";

import { randomBytes, createHash } from "node:crypto";
import { db } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit";
import { isPlatformUser } from "@/lib/auth/platform-identity";

const INVITE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const RESEND_COOLDOWN_MS = 60 * 1000; // 1 resend per minute per invitation

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export class InvitationError extends Error {}
export class InvitationAcceptError extends Error {
  constructor(public reason: "invalid" | "already-accepted" | "revoked" | "expired" | "existing-account" | "not-active" | "wrong-account" | "platform-owner") {
    super(reason);
  }
}

/**
 * Issues a fresh invitation token bound to one specific membership (not an
 * email). Upserts on `membershipId` so re-inviting the same membership (e.g.
 * an admin retries right after the first attempt) replaces the token rather
 * than creating a duplicate row — the raw token is returned only to build
 * the email link and is never stored; the database only ever holds its
 * SHA-256 hash.
 */
export async function createInvitation(input: {
  organizationId: string;
  membershipId: string;
  email: string;
  createdById?: string | null;
}): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + INVITE_TOKEN_TTL_MS);

  await db.invitation.upsert({
    where: { membershipId: input.membershipId },
    update: {
      tokenHash,
      status: "PENDING",
      expiresAt,
      createdById: input.createdById,
      resentCount: 0,
      lastSentAt: new Date(),
      lastDeliveryFailed: false,
      acceptedAt: null,
    },
    create: {
      organizationId: input.organizationId,
      membershipId: input.membershipId,
      email: input.email,
      tokenHash,
      expiresAt,
      createdById: input.createdById,
      lastSentAt: new Date(),
    },
  });

  return token;
}

/** Records that the invite email failed to send, without invalidating the token — an admin can still resend or share the link manually. */
export async function markInvitationDeliveryFailed(membershipId: string): Promise<void> {
  await db.invitation.updateMany({ where: { membershipId }, data: { lastDeliveryFailed: true } });
}

/**
 * Issues a new token for an existing PENDING invitation (simple rate limit:
 * at most one resend per minute, so a slow admin double-click doesn't burn
 * through the 7-day window pointlessly). Returns the fresh raw token.
 */
export async function resendInvitation(organizationId: string, membershipId: string): Promise<string> {
  const invitation = await db.invitation.findFirst({ where: { membershipId, organizationId } });
  if (!invitation) throw new InvitationError("Invitation not found.");
  if (invitation.status !== "PENDING") throw new InvitationError("This invitation is no longer pending.");
  if (invitation.lastSentAt && Date.now() - invitation.lastSentAt.getTime() < RESEND_COOLDOWN_MS) {
    throw new InvitationError("Please wait a moment before resending this invitation.");
  }

  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + INVITE_TOKEN_TTL_MS);

  await db.invitation.update({
    where: { id: invitation.id },
    data: { tokenHash, expiresAt, resentCount: { increment: 1 }, lastSentAt: new Date(), lastDeliveryFailed: false },
  });

  return token;
}

/** Atomically claims PENDING -> REVOKED; a concurrent accept or a second revoke click resolves to a no-op count of zero. */
export async function revokeInvitation(organizationId: string, membershipId: string): Promise<void> {
  const invitation = await db.invitation.findFirst({ where: { membershipId, organizationId } });
  if (!invitation) throw new InvitationError("Invitation not found.");
  const claimed = await db.invitation.updateMany({ where: { id: invitation.id, status: "PENDING" }, data: { status: "REVOKED" } });
  if (claimed.count === 0) throw new InvitationError("This invitation can no longer be revoked.");
}

async function resolveInvitationForAccept(token: string) {
  const tokenHash = hashToken(token);
  const invitation = await db.invitation.findUnique({
    where: { tokenHash },
    include: { membership: { include: { user: true, organization: true } } },
  });

  if (!invitation) throw new InvitationAcceptError("invalid");
  if (invitation.status === "ACCEPTED") throw new InvitationAcceptError("already-accepted");
  if (invitation.status === "REVOKED") throw new InvitationAcceptError("revoked");
  if (invitation.expiresAt < new Date()) throw new InvitationAcceptError("expired");

  return invitation;
}

/** Read-only lookup for the /invite page to decide which UI to render (password-setup vs. "log in to accept"). Throws the same typed errors as the accept functions for a consistent error-message mapping. */
export async function previewInvitation(token: string) {
  const invitation = await resolveInvitationForAccept(token);
  return {
    email: invitation.email,
    organizationName: invitation.membership.organization.name,
    isNewUser: invitation.membership.user.status === "INVITED",
  };
}

/**
 * Accepts an invitation for a brand-new user: sets their password and
 * activates only this invitation's membership — never every INVITED
 * membership the user might have across other organizations, which was the
 * confirmed cross-tenant bug in the previous email-keyed token design.
 */
export async function acceptInvitationNewUser(token: string, passwordHash: string): Promise<{ organizationName: string }> {
  const invitation = await resolveInvitationForAccept(token);
  if (invitation.membership.user.status !== "INVITED") {
    throw new InvitationAcceptError("existing-account");
  }

  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: invitation.membership.userId },
      data: { passwordHash, status: "ACTIVE", sessionVersion: { increment: 1 } },
    });
    await tx.organizationMember.update({
      where: { id: invitation.membershipId },
      data: { status: "ACTIVE", joinedAt: new Date() },
    });
    await tx.invitation.update({ where: { id: invitation.id }, data: { status: "ACCEPTED", acceptedAt: new Date() } });
    await logAuditEvent(
      {
        organizationId: invitation.organizationId,
        userId: invitation.membership.userId,
        membershipId: invitation.membershipId,
        module: "administration",
        action: "invitation.accepted",
        entityName: "OrganizationMember",
        entityId: invitation.membershipId,
        metadata: { path: "new-user" },
      },
      tx,
    );
  });

  return { organizationName: invitation.membership.organization.name };
}

/**
 * Accepts an invitation for an already-existing, already-active user — the
 * password is never touched. Requires the currently authenticated session to
 * belong to the exact user the invitation targets; the caller (the "confirm
 * invitation" action) is responsible for redirecting to /login first if
 * there's no session yet.
 */
export async function acceptInvitationExistingUser(token: string, sessionUserId: string): Promise<{ organizationName: string }> {
  const invitation = await resolveInvitationForAccept(token);
  if (invitation.membership.user.status !== "ACTIVE") {
    throw new InvitationAcceptError("not-active");
  }
  if (invitation.membership.userId !== sessionUserId) {
    throw new InvitationAcceptError("wrong-account");
  }
  if (await isPlatformUser(sessionUserId)) {
    throw new InvitationAcceptError("platform-owner");
  }

  await db.$transaction(async (tx) => {
    await tx.organizationMember.update({
      where: { id: invitation.membershipId },
      data: { status: "ACTIVE", joinedAt: new Date() },
    });
    await tx.invitation.update({ where: { id: invitation.id }, data: { status: "ACCEPTED", acceptedAt: new Date() } });
    await logAuditEvent(
      {
        organizationId: invitation.organizationId,
        userId: sessionUserId,
        membershipId: invitation.membershipId,
        module: "administration",
        action: "invitation.accepted",
        entityName: "OrganizationMember",
        entityId: invitation.membershipId,
        metadata: { path: "existing-user" },
      },
      tx,
    );
  });

  return { organizationName: invitation.membership.organization.name };
}
