import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const MAX_PROOF_AGE_MS = 2 * 60 * 60 * 1000;
const MIN_PROOF_AGE_MS = 1_000;

function signatureFor(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createContactFormProof(secret: string, now = Date.now()) {
  const payload = `${now}.${randomBytes(16).toString("base64url")}`;
  return `${payload}.${signatureFor(payload, secret)}`;
}

export function verifyContactFormProof(proof: FormDataEntryValue | null, secret: string, now = Date.now()) {
  if (typeof proof !== "string" || !proof.trim() || !secret) return false;

  const parts = proof.split(".");
  if (parts.length !== 3) return false;
  const [timestampText, nonce, suppliedSignature] = parts;
  if (!timestampText || !nonce || !suppliedSignature) return false;

  const timestamp = Number(timestampText);
  const age = now - timestamp;
  if (!Number.isSafeInteger(timestamp) || age < MIN_PROOF_AGE_MS || age > MAX_PROOF_AGE_MS) return false;

  const expectedSignature = signatureFor(`${timestampText}.${nonce}`, secret);
  const expected = Buffer.from(expectedSignature);
  const supplied = Buffer.from(suppliedSignature);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export function isContactHoneypotClear(value: FormDataEntryValue | null) {
  return typeof value !== "string" || value.trim() === "";
}
