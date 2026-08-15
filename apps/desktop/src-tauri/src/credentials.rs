//! Secure credential storage, backed by the `keyring` crate's Windows
//! Credential Manager integration. Backs both:
//!   - the `credentials_*` commands `src/security/credential-store.ts`
//!     invokes (access/refresh tokens, the local-unlock-passcode hash/salt,
//!     the payload encryption key export): see CredentialKey in that file
//!     for the exhaustive allowed list;
//!   - `db.rs`'s SQLCipher database key, which is never exposed to the
//!     TypeScript side at all (it has its own dedicated keyring entry, not
//!     one of the CredentialKey values above).
//!
//! # Honesty about verification status
//! Written against `keyring` 3.x's documented API. Not compiled or run in
//! this environment: see db.rs's module doc comment for the same caveat,
//! and CLAUDE_HANDOFF.md for what must be verified before this is relied
//! on for a release. Do not describe this as "tested" until it has
//! actually been exercised against a real Windows Credential Manager.

use keyring::Entry;
use tauri::AppHandle;

const SERVICE_NAME: &str = "com.rockfrostgroup.desktop";
const SQLCIPHER_KEY_ACCOUNT: &str = "sqlcipher-database-key";

/// The exhaustive set of secrets the TypeScript side may ask this module to
/// store: mirrors `CredentialKey` in `src/security/credential-store.ts`
/// exactly. Validated here too (not just trusted from the JS side) so a
/// bug on the TypeScript side can't smuggle an unexpected key name into
/// the OS credential store.
const ALLOWED_CREDENTIAL_KEYS: &[&str] = &[
    "accessToken",
    "refreshToken",
    "payloadEncryptionKey",
    "unlockPasscodeHash",
    "unlockPasscodeSalt",
];

fn entry_for(key: &str) -> Result<Entry, String> {
    if !ALLOWED_CREDENTIAL_KEYS.contains(&key) {
        return Err(format!("Refusing to store an unrecognized credential key: {key}"));
    }
    Entry::new(SERVICE_NAME, key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn credentials_get(key: String) -> Result<Option<String>, String> {
    let entry = entry_for(&key)?;
    match entry.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn credentials_set(key: String, value: String) -> Result<(), String> {
    let entry = entry_for(&key)?;
    entry.set_password(&value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn credentials_delete(key: String) -> Result<(), String> {
    let entry = entry_for(&key)?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        // Deleting something that was never set is not an error from the
        // caller's point of view (sign-out/revocation calls this
        // unconditionally for every key).
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn credentials_clear() -> Result<(), String> {
    for key in ALLOWED_CREDENTIAL_KEYS {
        credentials_delete((*key).to_string())?;
    }
    Ok(())
}

/// Not exposed as a `#[tauri::command]`: only `db.rs`'s `init_db` calls
/// this directly, since the SQLCipher key must never be reachable from the
/// TypeScript/webview process at all, unlike the credentials above.
pub fn get_or_create_sqlcipher_key(_app_handle: &AppHandle) -> Result<String, String> {
    let entry = Entry::new(SERVICE_NAME, SQLCIPHER_KEY_ACCOUNT).map_err(|e| e.to_string())?;

    match entry.get_password() {
        Ok(existing) => Ok(existing),
        Err(keyring::Error::NoEntry) => {
            use rand::RngCore;
            let mut key_bytes = [0u8; 32];
            rand::thread_rng().fill_bytes(&mut key_bytes);
            let hex_key = key_bytes.iter().map(|b| format!("{b:02x}")).collect::<String>();
            entry.set_password(&hex_key).map_err(|e| e.to_string())?;
            Ok(hex_key)
        }
        Err(e) => Err(e.to_string()),
    }
}
