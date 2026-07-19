import "server-only";

import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const INVITE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function resetIdentifier(email: string) {
  return `password-reset:${email.toLowerCase()}`;
}

function inviteIdentifier(email: string) {
  return `invite:${email.toLowerCase()}`;
}

async function issueToken(identifier: string, ttlMs: number) {
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + ttlMs);

  // Replace any existing token for this identifier so only the latest link works.
  await db.verificationToken.deleteMany({ where: { identifier } });
  await db.verificationToken.create({ data: { identifier, token, expires } });

  return token;
}

async function consumeToken(identifier: string, token: string) {
  const record = await db.verificationToken.findUnique({
    where: { identifier_token: { identifier, token } },
  });

  if (!record || record.expires < new Date()) {
    return false;
  }

  await db.verificationToken.delete({ where: { identifier_token: { identifier, token } } });
  return true;
}

export async function issuePasswordResetToken(email: string) {
  return issueToken(resetIdentifier(email), RESET_TOKEN_TTL_MS);
}

export async function consumePasswordResetToken(email: string, token: string) {
  return consumeToken(resetIdentifier(email), token);
}

export async function issueInviteToken(email: string) {
  return issueToken(inviteIdentifier(email), INVITE_TOKEN_TTL_MS);
}

export async function consumeInviteToken(email: string, token: string) {
  return consumeToken(inviteIdentifier(email), token);
}
