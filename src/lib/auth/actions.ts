"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { issuePasswordResetToken, consumePasswordResetToken } from "@/lib/auth/tokens";
import { revokeUserSessions } from "@/lib/auth/session-revocation";
import { acceptInvitationNewUser, acceptInvitationExistingUser, InvitationAcceptError } from "@/lib/auth/invitations";
import { getServerAuthSession } from "@/lib/auth/session";

function clean(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/**
 * NextAuth v4's credentials provider collapses every authorize() failure
 * (including a thrown Error) to the fixed string "CredentialsSignin" —
 * it does not forward a custom message. To show a real "too many attempts"
 * message, the login page checks lock status here *before* calling
 * signIn(), rather than trying to smuggle it through NextAuth's error
 * channel.
 */
export async function getAccountLockStatus(email: string): Promise<{ locked: boolean; minutesLeft: number }> {
  const user = await db.user.findUnique({ where: { email: email.toLowerCase() }, select: { lockedUntil: true } });
  if (!user?.lockedUntil || user.lockedUntil <= new Date()) {
    return { locked: false, minutesLeft: 0 };
  }
  return { locked: true, minutesLeft: Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000) };
}

export async function requestPasswordReset(formData: FormData): Promise<void> {
  const email = clean(formData.get("email")).toLowerCase();

  if (email) {
    const user = await db.user.findUnique({ where: { email } });

    // Only issue a token (and only report success) if the account exists and can sign in —
    // never reveal via timing or response shape whether an email is registered.
    if (user && user.status === "ACTIVE") {
      const token = await issuePasswordResetToken(email);
      const resetUrl = `${siteUrl}/reset-password?email=${encodeURIComponent(email)}&token=${token}`;

      await sendEmail({
        to: email,
        subject: "Reset your Rock Frost Business Suite password",
        html: `<p>Someone requested a password reset for this account.</p><p><a href="${resetUrl}">Reset your password</a></p><p>This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>`,
      });
    }
  }

  redirect("/forgot-password?sent=1");
}

export async function resetPassword(formData: FormData): Promise<void> {
  const email = clean(formData.get("email")).toLowerCase();
  const token = clean(formData.get("token"));
  const password = clean(formData.get("password"));
  const confirmPassword = clean(formData.get("confirmPassword"));

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
  await revokeUserSessions(updated.id);

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
  const password = clean(formData.get("password"));
  const confirmPassword = clean(formData.get("confirmPassword"));

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

  try {
    await acceptInvitationNewUser(token, passwordHash);
  } catch (error) {
    if (error instanceof InvitationAcceptError) {
      redirect(`/invite?token=${token}&error=${error.reason}`);
    }
    throw error;
  }

  redirect("/login?activated=1");
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
