/**
 * Secure storage for the handful of secrets this client ever holds: the
 * sync access/refresh tokens and the local payload-encryption key (see
 * payload-encryption.ts). Nothing else qualifies — this app never stores a
 * raw password, a Neon/PostgreSQL credential, or any reusable server
 * secret, on device or otherwise. See CredentialKey below for the
 * exhaustive list of what this store is allowed to hold.
 *
 * IMPORTANT — honesty about what is and isn't verified in this
 * environment: TauriCredentialStore (below) calls into Rust commands
 * intended to be backed by the `keyring` crate, which wraps the real
 * Windows Credential Manager on this target platform. That Rust code is
 * written (src-tauri/src/credentials.rs) but this environment has no Rust
 * toolchain, so it has never been compiled or exercised end-to-end. Do not
 * describe OS-credential-store encryption as "wired and tested" until
 * someone with a working Rust/Tauri build has actually verified it — see
 * apps/desktop/CLAUDE_HANDOFF.md.
 */

import { invoke } from "@tauri-apps/api/core";

/**
 * The exhaustive set of secrets this app is allowed to persist. Deliberately
 * not a bare `string` key — adding a new kind of secret here should be a
 * conscious, reviewed decision, not an incidental string typo.
 *
 * `unlockPasscodeHash`/`unlockPasscodeSalt` hold a PBKDF2 hash + salt of
 * the local offline-unlock passcode (see security/local-passcode.ts) —
 * never the passcode itself, and never the cloud account password.
 */
export type CredentialKey = "accessToken" | "refreshToken" | "payloadEncryptionKey" | "unlockPasscodeHash" | "unlockPasscodeSalt";

export interface CredentialStore {
  get(key: CredentialKey): Promise<string | null>;
  set(key: CredentialKey, value: string): Promise<void>;
  delete(key: CredentialKey): Promise<void>;
  /** Deletes every credential this store has ever been asked to hold — used on sign-out, deactivation, and remote revocation. */
  clear(): Promise<void>;
}

/**
 * Production implementation. Each call is a single `invoke()` into
 * src-tauri/src/credentials.rs, which is intended to use the `keyring`
 * crate (Windows Credential Manager backend) so secrets never touch this
 * app's own disk storage in any form the desktop client controls directly.
 *
 * See the file-level doc comment above: this has not been build-verified
 * in this environment.
 */
export class TauriCredentialStore implements CredentialStore {
  async get(key: CredentialKey): Promise<string | null> {
    return invoke<string | null>("credentials_get", { key });
  }

  async set(key: CredentialKey, value: string): Promise<void> {
    await invoke("credentials_set", { key, value });
  }

  async delete(key: CredentialKey): Promise<void> {
    await invoke("credentials_delete", { key });
  }

  async clear(): Promise<void> {
    await invoke("credentials_clear");
  }
}

/**
 * Explicitly insecure, process-memory-only store. Used only:
 *  - In the Vitest unit test suite.
 *  - In `npm run dev`'s plain-browser preview (matches
 *    src/db/create-local-database.ts's MemoryLocalDatabase fallback), where
 *    there is no Tauri runtime to back a real OS credential store at all.
 *
 * This class must never be selected for a packaged build — see
 * src/security/create-credential-store.ts, which mirrors
 * src/db/create-local-database.ts's Tauri-detection logic.
 */
export class InMemoryCredentialStore implements CredentialStore {
  private readonly values = new Map<CredentialKey, string>();

  async get(key: CredentialKey): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async set(key: CredentialKey, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async delete(key: CredentialKey): Promise<void> {
    this.values.delete(key);
  }

  async clear(): Promise<void> {
    this.values.clear();
  }
}
