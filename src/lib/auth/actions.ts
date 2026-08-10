"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { issuePasswordResetToken, consumePasswordResetToken } from "@/lib/auth/tokens";
import { revokeUserSessions } from "@/lib/auth/session-revocation";
import { acceptInvitationNewUser, acceptInvitationExistingUser, InvitationAcceptError } from "@/lib/auth/invitations";
import { getServerAuthSession } from "@/lib/auth/session";
import { email as emailSchema } from "@/lib/validation";
import { logAuditEvent } from "@/lib/audit";
import { headers } from "next/headers";
import { buildSurfaceUrl, classifyAppSurface } from "@/lib/app-surfaces";

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function passwordValue(value: FormDataEntryValue | null) {
  return String(value ?? "");
}

/**
 * NextAuth v4's credentials provider collapses every authorize() failure
 * (including a thrown Error) to the fixed string "CredentialsSignin" —
 * it does not forward a custom message. To show a real "too many attempts"
 * message, the login page checks lock status here *before* calling
 * signIn(), rather than trying to smuggle it through NextAuth's error
 * channel.
 */
export async function getAccountLockStatus(email: string): Promise<{ locked: boolean; minutesLeft: number }> {
  const parsedEmail = emailSchema.safeParse(email);
  if (!parsedEmail.success) {
    return { locked: false, minutesLeft: 0 };
  }

  const user = await db.user.findUnique({ where: { email: parsedEmail.data }, select: { lockedUntil: true } });
  if (!user?.lockedUntil || user.lockedUntil <= new Date()) {
    return { locked: false, minutesLeft: 0 };
  }
  return { locked: true, minutesLeft: Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000) };
}

export async function requestPasswordReset(formData: FormData): Promise<void> {
  const parsedEmail = emailSchema.safeParse(clean(formData.get("email")));

  if (parsedEmail.success) {
    const email = parsedEmail.data;
    const user = await db.user.findUnique({ where: { email } });

    // Only issue a token (and only report success) if the account exists and can sign in —
    // never reveal via timing or response shape whether an email is registered.
    if (user && user.status === "ACTIVE") {
      const token = await issuePasswordResetToken(email);
      const requestHeaders = await headers();
      const surface = classifyAppSurface(
        requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host"),
      );
      const resetUrl = buildSurfaceUrl(surface === "platform" ? "platform" : "tenant", "/reset-password");
      resetUrl.searchParams.set("email", email);
      resetUrl.searchParams.set("token", token);

      await sendEmail({
        to: email,
        subject: "Reset your Rock Frost Business Suite password",
        html: `<p>Someone requested a password reset for this account.</p><p><a href="${resetUrl.toString()}">Reset your password</a></p><p>This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>`,
      });
    }
  }

  redirect("/forgot-password?sent=1");
}

export async function resetPassword(formData: FormData): Promise<void> {
  const email = clean(formData.get("email")).toLowerCase();
  const token = clean(formData.get("token"));
  const password = passwordValue(formData.get("password"));
  const confirmPassword = passwordValue(formData.get("confirmPassword"));

  if (!email || !token) {
    redirect("/forgot-password?error=invalid-link");
  }
  if (password.length < 8) {
    redirect(`/reset-password?email=${encodeURIComponent(email)}&token=${token}&error=too-short`);
  }
  if (password !== confirmPassword) {
    redirect(`/reset-password?email=${encodeURIComponent(email)}&token=${token}&error=mismatch`);
  }

  const isValid = await consumePasswordResetToken(email, token);
  if (!isValid) {
    redirect("/forgot-password?error=expired-link");
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const updated = await db.user.update({ where: { email }, data: { passwordHash } });

  const membership = await db.organizationMember.findFirst({ where: { userId: updated.id }, orderBy: { createdAt: "asc" } });
  await logAuditEvent({
    organizationId: membership?.organizationId ?? null,
    userId: updated.id,
    membershipId: membership?.id ?? null,
    module: "auth",
    action: "password.reset",
    entityName: "User",
    entityId: updated.id,
  });
  await revokeUserSessions(updated.id, "password_reset");

  redirect("/login?reset=1");
}

/**
 * Accepts an invitation for a brand-new user (one who has never set a
 * password). Only the specific membership the invitation was issued for is
 * activated — never every INVITED membership the user might have, which was
 * the confirmed cross-tenant bug in the previous email-keyed token design
 * (see docs/HARDENING_PLAN.md's invitation-redesign section).
 */
export async function acceptInvite(formData: FormData): Promise<void> {
  const token = clean(formData.get("token"));
  const password = passwordValue(formData.get("password"));
  const confirmPassword = passwordValue(formData.get("confirmPassword"));

  if (!token) {
    redirect("/login?error=invalid-invite");
  }
  if (password.length < 8) {
    redirect(`/invite?token=${token}&error=too-short`);
  }
  if (password !== confirmPassword) {
    redirect(`/invite?token=${token}&error=mismatch`);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  let invitedEmail: string;
  try {
    const invitation = await acceptInvitationNewUser(token, passwordHash);
    invitedEmail = invitation.email;
  } catch (error) {
    if (error instanceof InvitationAcceptError) {
      redirect(`/invite?token=${token}&error=${error.reason}`);
    }
    throw error;
  }

  redirect(`/login?activated=1&email=${encodeURIComponent(invitedEmail)}`);
}

/**
 * Accepts an invitation for an existing, already-active user — never
 * touches their password. Requires the current session to already belong
 * to the exact user the invitation targets; the /invite page only renders
 * this form's button when that's true, and redirects to /login first
 * otherwise.
 */
export async function acceptInviteExisting(formData: FormData): Promise<void> {
  const token = clean(formData.get("token"));
  if (!token) redirect("/login?error=invalid-invite");

  const session = await getServerAuthSession();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/invite?token=${token}`)}`);
  }

  try {
    await acceptInvitationExistingUser(token, session!.user.id);
  } catch (error) {
    if (error instanceof InvitationAcceptError) {
      redirect(`/invite?token=${token}&error=${error.reason}`);
    }
    throw error;
  }

  redirect("/app/dashboard?joined=1");
}
