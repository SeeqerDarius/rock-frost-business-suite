import "server-only";

import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

/**
 * Step-up re-authentication for irreversible/financial actions (crediting a
 * refund, reactivating a dormant account after a service-fee deduction,
 * etc.) — the acting user re-enters their own current password, separate
 * from their session. Migrated from GLV's admin-password-confirmation
 * pattern, generalized here to any signed-in user rather than admin-only,
 * since this system's permission model already gates who can reach these
 * actions in the first place.
 */
export async function verifyCurrentPassword(userId: string, password: string): Promise<boolean> {
  if (!password) return false;
  const user = await db.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  if (!user?.passwordHash) return false;
  return bcrypt.compare(password, user.passwordHash);
}
