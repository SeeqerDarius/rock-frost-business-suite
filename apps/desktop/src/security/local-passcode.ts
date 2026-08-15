/**
 * The device lock screen (security/device-lock.ts) must be able to unlock
 * while genuinely offline: that's the entire point of a local-first app -
 * so it cannot depend on re-validating the cloud password against the
 * server. Instead, activation asks the user to set a short local unlock
 * passcode, and only a PBKDF2 hash + random salt of it is ever persisted
 * (via the credential store, alongside the sync tokens): never the raw
 * passcode, and this passcode is never sent to the server or reused as the
 * cloud account password.
 */

const PBKDF2_ITERATIONS = 210_000; // OWASP's current baseline recommendation for PBKDF2-SHA256.
const HASH_LENGTH_BITS = 256;
const SALT_LENGTH_BYTES = 16;

function bytesToBase64(bytes: Uint8Array<ArrayBuffer>): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function derive(passcode: string, salt: Uint8Array<ArrayBuffer>): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(passcode), "PBKDF2", false, ["deriveBits"]);
  const derivedBits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    HASH_LENGTH_BITS,
  );
  return bytesToBase64(new Uint8Array(derivedBits));
}

export interface StoredPasscode {
  hash: string;
  salt: string;
}

export function isValidPasscodeFormat(passcode: string): boolean {
  return /^\d{4,8}$/.test(passcode);
}

export async function hashPasscode(passcode: string): Promise<StoredPasscode> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH_BYTES));
  const hash = await derive(passcode, salt);
  return { hash, salt: bytesToBase64(salt) };
}

/**
 * Constant-time-ish comparison: both hashes are fixed-length base64 of a
 * fixed-length digest, so a simple loop comparing every character (rather
 * than short-circuiting `===`) avoids leaking early-mismatch timing for
 * what is, admittedly, a low-value target (a 4-8 digit local passcode) -
 * cheap to do correctly, so it's done correctly.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

export async function verifyPasscode(passcode: string, stored: StoredPasscode): Promise<boolean> {
  const candidate = await derive(passcode, base64ToBytes(stored.salt));
  return timingSafeEqual(candidate, stored.hash);
}
