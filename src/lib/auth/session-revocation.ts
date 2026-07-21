import "server-only";

import { db } from "@/lib/db";

/**
 * Invalidates every JWT session currently issued for this user by bumping
 * User.sessionVersion. NextAuth's jwt() callback (src/lib/auth/nextauth.ts)
 * re-reads this value on every request and clears the session the moment it
 * no longer matches what a given token was minted with — there is no
 * server-side session store to delete from under the JWT strategy, so
 * "revoke" means "make every existing token fail its next revalidation."
 *
 * Call this after any user-level credential change: password reset, password
 * change, invite acceptance (which sets a password). Membership- or
 * organization-level state (suspended/removed membership, suspended
 * organization) does not need this — it's re-validated straight from the
 * database on every request by getCurrentTenant() regardless of JWT contents.
 */
export async function revokeUserSessions(userId: string): Promise<void> {
  await db.user.update({
    where: { id: userId },
    data: { sessionVersion: { increment: 1 } },
  });
}
