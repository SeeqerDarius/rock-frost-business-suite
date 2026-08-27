import "server-only";

import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import type { TwoFactorOtpPurpose } from "@prisma/client";
import { db } from "@/lib/db";
import { sendSms } from "@/lib/sms";
import { normalizeGhanaPhone } from "@/lib/phone";

const CODE_TTL_MS = 5 * 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;

function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export interface IssueSmsOtpArgs {
  userId: string;
  organizationId: string;
  purpose: TwoFactorOtpPurpose;
  phone: string;
}

export async function issueSmsOtpChallenge(args: IssueSmsOtpArgs): Promise<{ ok: boolean; error?: string }> {
  const phone = normalizeGhanaPhone(args.phone);
  if (!phone) return { ok: false, error: "Invalid phone number." };

  const code = generateOtpCode();
  const codeHash = await bcrypt.hash(code, 10);
  await db.twoFactorOtpChallenge.create({
    data: { userId: args.userId, purpose: args.purpose, phone, codeHash, expiresAt: new Date(Date.now() + CODE_TTL_MS) },
  });

  return sendSms({
    to: phone,
    body: `Your Rock Frost verification code is ${code}. It expires in 5 minutes. Do not share this code with anyone.`,
    purpose: `2FA_${args.purpose}`,
    organizationId: args.organizationId,
    relatedType: "User",
    relatedId: args.userId,
    isOtp: true,
  });
}

/**
 * Looks up the most recent unconsumed challenge for this user/purpose - a
 * user can only have one pending code per purpose in practice, since issuing
 * a new one doesn't invalidate an older row, but always checking the newest
 * one means a fresh "resend" always supersedes a stale one.
 */
export async function consumeSmsOtpChallenge(
  userId: string,
  purpose: TwoFactorOtpPurpose,
  code: string,
): Promise<{ ok: boolean; phone?: string }> {
  const challenge = await db.twoFactorOtpChallenge.findFirst({
    where: { userId, purpose, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!challenge || challenge.expiresAt < new Date() || challenge.attempts >= MAX_VERIFY_ATTEMPTS) {
    return { ok: false };
  }

  const normalized = code.replace(/\s+/g, "");
  const valid = /^\d{6}$/.test(normalized) && (await bcrypt.compare(normalized, challenge.codeHash));

  if (!valid) {
    await db.twoFactorOtpChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
    return { ok: false };
  }

  await db.twoFactorOtpChallenge.update({ where: { id: challenge.id }, data: { consumedAt: new Date() } });
  return { ok: true, phone: challenge.phone };
}

/** Whether this user has a live (unexpired, unconsumed) challenge for the given purpose - used by UI to decide whether to show the "enter code" step or the "send code" step. */
export async function hasPendingSmsOtpChallenge(userId: string, purpose: TwoFactorOtpPurpose): Promise<boolean> {
  const challenge = await db.twoFactorOtpChallenge.findFirst({
    where: { userId, purpose, consumedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true },
  });
  return Boolean(challenge);
}
