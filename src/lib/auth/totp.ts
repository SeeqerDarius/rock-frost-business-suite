import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;

function base32Encode(buffer: Buffer) {
  let bits = "";
  for (const byte of buffer) bits += byte.toString(2).padStart(8, "0");
  let output = "";
  for (let index = 0; index < bits.length; index += 5) {
    output += ALPHABET[Number.parseInt(bits.slice(index, index + 5).padEnd(5, "0"), 2)];
  }
  return output;
}

function base32Decode(secret: string) {
  let bits = "";
  for (const character of secret.replace(/=+$/g, "").replace(/\s+/g, "").toUpperCase()) {
    const value = ALPHABET.indexOf(character);
    if (value < 0) throw new Error("Invalid TOTP secret.");
    bits += value.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
}

function codeAt(secret: string, timestampMs: number) {
  const counter = Math.floor(timestampMs / 1000 / STEP_SECONDS);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", base32Decode(secret)).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

export function generateTotpSecret() {
  return base32Encode(randomBytes(20));
}

export function getTotpUri(email: string, secret: string) {
  const issuer = "Rock Frost Business Suite";
  const params = new URLSearchParams({ secret, issuer, algorithm: "SHA1", digits: "6", period: String(STEP_SECONDS) });
  return `otpauth://totp/${encodeURIComponent(`${issuer}:${email}`)}?${params}`;
}

export function verifyTotpCode(secret: string, code: string, timestampMs = Date.now()) {
  const normalized = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(normalized)) return false;
  const provided = Buffer.from(normalized);
  for (const offset of [-1, 0, 1]) {
    const expected = Buffer.from(codeAt(secret, timestampMs + offset * STEP_SECONDS * 1000));
    if (expected.length === provided.length && timingSafeEqual(expected, provided)) return true;
  }
  return false;
}

function encryptionKey() {
  const secret = process.env.TWO_FACTOR_ENCRYPTION_KEY?.trim() || process.env.NEXTAUTH_SECRET?.trim();
  if (!secret) throw new Error("Two-factor encryption is not configured.");
  return createHash("sha256").update(`rock-frost:two-factor:${secret}`).digest();
}

export function encryptTotpSecret(secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptTotpSecret(value: string) {
  const [version, iv, tag, ciphertext] = value.split(".");
  if (version !== "v1" || !iv || !tag || !ciphertext) throw new Error("Invalid encrypted TOTP secret.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}
