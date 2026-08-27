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
import { consumeSmsOtpChallenge, issueSmsOtpChallenge } from "@/lib/auth/sms-otp";
import { normalizeGhanaPhone } from "@/lib/phone";

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
  const record = await db.user.findUnique({
    where: { id: user.id },
    select: { twoFactorSecret: true, twoFactorEnabled: true, twoFactorMethod: true },
  });
  if (!record?.twoFactorEnabled) redirect(`${destination}?error=setup`);

  let valid = false;
  if (record.twoFactorMethod === "SMS") {
    valid = (await consumeSmsOtpChallenge(user.id, "DISABLE", value(formData, "code"))).ok;
  } else if (record.twoFactorSecret) {
    try {
      valid = verifyTotpCode(decryptTotpSecret(record.twoFactorSecret), value(formData, "code"));
    } catch {
      valid = false;
    }
  }
  if (!valid) {
    redirect(`${destination}?error=code`);
  }
  await db.user.update({
    where: { id: user.id },
    data: { twoFactorSecret: null, twoFactorEnabled: false, twoFactorConfirmedAt: null, twoFactorMethod: null, twoFactorPhone: null },
  });
  await audit(user.id, "two_factor.disabled");
  await revokeUserSessions(user.id, "two_factor_disabled");
  redirect("/login?security=2fa-disabled");
}

/** Password-gated pre-flight that sends the code needed to disable SMS-based 2FA - mirrors why login needs a separate send step: the code doesn't exist until the server generates and texts it. */
export async function requestDisableSmsCode(formData: FormData): Promise<void> {
  const user = await currentUser();
  const destination = await securityPath();
  if (!(await verifyCurrentPassword(user.id, value(formData, "currentPassword")))) {
    redirect(`${destination}?error=password`);
  }
  const record = await db.user.findUnique({
    where: { id: user.id },
    select: { twoFactorEnabled: true, twoFactorMethod: true, twoFactorPhone: true },
  });
  if (!record?.twoFactorEnabled || record.twoFactorMethod !== "SMS" || !record.twoFactorPhone) {
    redirect(`${destination}?error=setup`);
  }
  const membership = await db.organizationMember.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
  if (!membership) redirect(`${destination}?error=setup`);

  const result = await issueSmsOtpChallenge({
    userId: user.id,
    organizationId: membership.organizationId,
    purpose: "DISABLE",
    phone: record.twoFactorPhone,
  });
  if (!result.ok) redirect(`${destination}?error=sms-failed`);

  revalidatePath(destination);
  redirect(`${destination}?disableCodeSent=1`);
}

/**
 * Starts SMS-2FA enrollment: requires the account not already have 2FA
 * active (switching methods means disabling the current one first, via the
 * existing disableTwoFactor flow), and sends a verification code to the
 * phone number entered here rather than trusting the profile's `phone`
 * field sight-unseen - see the schema comment on User.twoFactorPhone.
 */
export async function beginSmsTwoFactorSetup(formData: FormData): Promise<void> {
  const user = await currentUser();
  const destination = await securityPath();
  if (!(await verifyCurrentPassword(user.id, value(formData, "currentPassword")))) {
    redirect(`${destination}?error=password`);
  }
  const record = await db.user.findUnique({ where: { id: user.id }, select: { twoFactorEnabled: true } });
  if (record?.twoFactorEnabled) redirect(`${destination}?error=already-enabled`);

  const phone = normalizeGhanaPhone(value(formData, "phone"));
  if (!phone) redirect(`${destination}?error=phone`);

  const membership = await db.organizationMember.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
  if (!membership) redirect(`${destination}?error=setup`);

  const result = await issueSmsOtpChallenge({ userId: user.id, organizationId: membership.organizationId, purpose: "ENROLL_VERIFY_PHONE", phone });
  if (!result.ok) redirect(`${destination}?error=sms-failed`);

  await audit(user.id, "two_factor.sms_setup_started");
  revalidatePath(destination);
  redirect(`${destination}?smsSetup=1`);
}

export async function confirmSmsTwoFactorSetup(formData: FormData): Promise<void> {
  const user = await currentUser();
  const destination = await securityPath();
  const { ok, phone } = await consumeSmsOtpChallenge(user.id, "ENROLL_VERIFY_PHONE", value(formData, "code"));
  if (!ok || !phone) redirect(`${destination}?error=code`);

  await db.user.update({
    where: { id: user.id },
    data: {
      twoFactorMethod: "SMS",
      twoFactorPhone: phone,
      twoFactorEnabled: true,
      twoFactorConfirmedAt: new Date(),
      phoneVerifiedAt: new Date(),
    },
  });
  await audit(user.id, "two_factor.enabled");
  await revokeUserSessions(user.id, "two_factor_enabled");
  redirect("/login?security=2fa-enabled");
}
