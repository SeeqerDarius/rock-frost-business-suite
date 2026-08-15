/**
 * Application-layer encryption for individual cached-record and
 * queued-mutation payloads, on top of (not instead of) the full-database
 * SQLCipher encryption applied in src-tauri/src/db.rs. Defense in depth: if
 * the database file were ever copied out or read through some other tool,
 * business-data payload columns are still opaque ciphertext without the
 * session key.
 *
 * This implementation is genuinely wired and covered by real round-trip
 * unit tests (see payload-encryption.test.ts) using the Web Crypto API
 * (`crypto.subtle`), which is available both in the Tauri webview (a real
 * browser engine) and in this repository's Node-based test runner — unlike
 * the OS-credential-store abstraction in credential-store.ts, this one does
 * not depend on anything this environment couldn't actually exercise.
 */

const ALGORITHM = "AES-GCM";
const KEY_LENGTH_BITS = 256;
const IV_LENGTH_BYTES = 12; // 96-bit IV is the AES-GCM-recommended size.

export interface EncryptedPayload {
  /** Base64-encoded ciphertext (includes the GCM authentication tag, per the Web Crypto API's own output format). */
  ciphertext: string;
  /** Base64-encoded initialization vector, unique per encryption call. Not secret — required to decrypt. */
  iv: string;
}

export interface PayloadEncryptor {
  encrypt(plaintext: unknown): Promise<EncryptedPayload>;
  decrypt(payload: EncryptedPayload): Promise<unknown>;
}

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

/** Generates a fresh random AES-256-GCM key. Callers are responsible for handing the exported key to CredentialStore for OS-backed persistence — this module never persists anything itself. */
export async function generateEncryptionKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: ALGORITHM, length: KEY_LENGTH_BITS }, true, ["encrypt", "decrypt"]);
}

export async function exportEncryptionKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", key);
  return bytesToBase64(new Uint8Array(raw));
}

export async function importEncryptionKey(exported: string): Promise<CryptoKey> {
  const raw = base64ToBytes(exported);
  return crypto.subtle.importKey("raw", raw, { name: ALGORITHM }, true, ["encrypt", "decrypt"]);
}

/** The real {@link PayloadEncryptor}, backed by a single in-memory AES-256-GCM CryptoKey supplied at construction. The key itself is never written by this class — see credential-store.ts for where it's persisted. */
export class AesGcmPayloadEncryptor implements PayloadEncryptor {
  constructor(private readonly key: CryptoKey) {}

  async encrypt(plaintext: unknown): Promise<EncryptedPayload> {
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH_BYTES));
    const encoded = new TextEncoder().encode(JSON.stringify(plaintext));
    const ciphertextBuffer = await crypto.subtle.encrypt({ name: ALGORITHM, iv }, this.key, encoded);
    return {
      ciphertext: bytesToBase64(new Uint8Array(ciphertextBuffer)),
      iv: bytesToBase64(iv),
    };
  }

  async decrypt(payload: EncryptedPayload): Promise<unknown> {
    const iv = base64ToBytes(payload.iv);
    const ciphertext = base64ToBytes(payload.ciphertext);
    const plaintextBuffer = await crypto.subtle.decrypt({ name: ALGORITHM, iv }, this.key, ciphertext);
    const decoded = new TextDecoder().decode(plaintextBuffer);
    return JSON.parse(decoded);
  }
}

/**
 * A deliberately non-functional {@link PayloadEncryptor} — throws on every
 * call. Used as the default before a session key has been established
 * (before sign-in / after lock), so a programming error that tries to
 * encrypt or decrypt outside an unlocked session fails loudly instead of
 * silently writing plaintext.
 */
export class NoSessionPayloadEncryptor implements PayloadEncryptor {
  async encrypt(_plaintext: unknown): Promise<EncryptedPayload> {
    throw new Error("No active session encryption key. Cannot encrypt payload before device unlock.");
  }
  async decrypt(_payload: EncryptedPayload): Promise<unknown> {
    throw new Error("No active session encryption key. Cannot decrypt payload before device unlock.");
  }
}
