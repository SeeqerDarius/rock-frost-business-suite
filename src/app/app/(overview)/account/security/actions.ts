"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { logAuditEvent } from "@/lib/audit";
import { getServerAuthSession } from "@/lib/auth/session";
import { revokeUserSessions } from "@/lib/auth/session-revocation";
import { verifyCurrentPassword } from "@/lib/auth/verify-password";
import { decryptTotpSecret, encryptTotpSecret, generateTotpSecret, verifyTotpCode } from "@/lib/auth/totp";

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

async function securityPath() {
  const referer = (await headers()).get("referer") ?? "";
  return referer.includes("/app/platform/") ? "/app/platform/account/security" : "/app/account/security";
}

async function currentUser() {
  const session = await getServerAuthSession();
  if (!session?.user?.id) redirect("/login");
  return session.user;
}

async function audit(userId: string, action: string) {
  const membership = await db.organizationMember.findFirst({ where: { userId }, orderBy: { createdAt: "asc" } });
  await logAuditEvent({
    organizationId: membership?.organizationId ?? null,
    membershipId: membership?.id ?? null,
    userId,
    module: "auth",
    action,
    entityName: "User",
    entityId: userId,
  });
}

export async function beginTwoFactorSetup(formData: FormData): Promise<void> {
  const user = await currentUser();
  const destination = await securityPath();
  if (!(await verifyCurrentPassword(user.id, value(formData, "currentPassword")))) {
    redirect(`${destination}?error=password`);
  }
  await db.user.update({
    where: { id: user.id },
    data: { twoFactorSecret: encryptTotpSecret(generateTotpSecret()), twoFactorEnabled: false, twoFactorConfirmedAt: null },
  });
  await audit(user.id, "two_factor.setup_started");
  revalidatePath(destination);
  redirect(`${destination}?setup=1`);
}

export async function confirmTwoFactorSetup(formData: FormData): Promise<void> {
  const user = await currentUser();
  const destination = await securityPath();
  const record = await db.user.findUnique({ where: { id: user.id }, select: { twoFactorSecret: true } });
  if (!record?.twoFactorSecret) redirect(`${destination}?error=setup`);
  let valid = false;
  try {
    valid = verifyTotpCode(decryptTotpSecret(record.twoFactorSecret), value(formData, "code"));
  } catch {
    redirect(`${destination}?error=setup`);
  }
  if (!valid) redirect(`${destination}?error=code`);
  await db.user.update({
    where: { id: user.id },
    data: { twoFactorEnabled: true, twoFactorConfirmedAt: new Date() },
  });
  await audit(user.id, "two_factor.enabled");
  await revokeUserSessions(user.id, "two_factor_enabled");
  redirect("/login?security=2fa-enabled");
}

export async function disableTwoFactor(formData: FormData): Promise<void> {
  const user = await currentUser();
  const destination = await securityPath();
  if (!(await verifyCurrentPassword(user.id, value(formData, "currentPassword")))) {
    redirect(`${destination}?error=password`);
  }
  const record = await db.user.findUnique({ where: { id: user.id }, select: { twoFactorSecret: true, twoFactorEnabled: true } });
  if (!record?.twoFactorEnabled || !record.twoFactorSecret) redirect(`${destination}?error=setup`);
  let valid = false;
  try {
    valid = verifyTotpCode(decryptTotpSecret(record.twoFactorSecret), value(formData, "code"));
  } catch {
    valid = false;
  }
  if (!valid) {
    redirect(`${destination}?error=code`);
  }
  await db.user.update({
    where: { id: user.id },
    data: { twoFactorSecret: null, twoFactorEnabled: false, twoFactorConfirmedAt: null },
  });
  await audit(user.id, "two_factor.disabled");
  await revokeUserSessions(user.id, "two_factor_disabled");
  redirect("/login?security=2fa-disabled");
}
