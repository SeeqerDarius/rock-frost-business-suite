import "server-only";

import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function resetIdentifier(email: string) {
  return `password-reset:${email.toLowerCase()}`;
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
