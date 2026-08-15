//! Encrypted, device-local SQLite storage. This is the ONLY module in the
//! whole application that opens the database connection or writes SQL —
//! every table this app has (device metadata, cached records, mutation
//! queue, sync cursors, conflicts, audit events) is defined and queried
//! here. `src/db/tauri-database.ts` on the TypeScript side never sees a
//! connection, a table name, or the encryption key; it only calls the
//! typed commands in `commands.rs`.
//!
//! # Encryption
//! Uses SQLCipher (via `rusqlite`'s `bundled-sqlcipher-vendored-openssl`
//! feature — see Cargo.toml) rather than plain SQLite, so the database
//! file on disk is encrypted at rest. The SQLCipher key itself is a
//! randomly generated 256-bit value, created once on first launch and
//! persisted through `credentials.rs` (Windows Credential Manager via the
//! `keyring` crate) — never written to disk in plaintext, never derived
//! from the user's cloud password, and never transmitted anywhere.
//!
//! # Honesty about verification status
//! This module has been written against `rusqlite` 0.32's documented
//! SQLCipher API and Tauri 2's app-data-dir conventions, but this
//! environment has no Rust toolchain — it has never been compiled, and the
//! SQLCipher `PRAGMA key` handshake in particular has not been exercised
//! end-to-end. Treat this as a solid starting implementation to compile,
//! fix, and verify, not as proven-working code. See CLAUDE_HANDOFF.md.

use rusqlite::Connection;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

use crate::credentials;

pub struct AppDb(pub Mutex<Connection>);

const SCHEMA_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS device (
    device_id TEXT PRIMARY KEY,
    device_name TEXT NOT NULL,
    organization_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    enabled_module_keys TEXT NOT NULL,
    activated_at TEXT NOT NULL,
    deactivated_at TEXT,
    deactivation_reason TEXT
);

CREATE TABLE IF NOT EXISTS cached_record (
    module_key TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    payload TEXT NOT NULL,
    has_pending_local_change INTEGER NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by_user_id TEXT,
    updated_by_user_name TEXT,
    PRIMARY KEY (module_key, entity_type, entity_id)
);

CREATE TABLE IF NOT EXISTS queued_mutation (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mutation_id TEXT NOT NULL UNIQUE,
    organization_id TEXT NOT NULL,
    module_key TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    base_version INTEGER,
    operation TEXT NOT NULL,
    changed_at TEXT NOT NULL,
    payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    attempt_count INTEGER NOT NULL DEFAULT 0,
    last_attempt_at TEXT,
    rejection_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_queued_mutation_status ON queued_mutation(status);

CREATE TABLE IF NOT EXISTS sync_cursor (
    module_key TEXT PRIMARY KEY,
    cursor TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conflict (
    conflict_id TEXT PRIMARY KEY,
    module_key TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    allowed_resolutions TEXT NOT NULL,
    local_value TEXT NOT NULL,
    local_changed_at TEXT NOT NULL,
    local_changed_by_user_name TEXT,
    cloud_value TEXT NOT NULL,
    cloud_changed_at TEXT NOT NULL,
    cloud_changed_by_user_name TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    detected_at TEXT NOT NULL,
    resolved_at TEXT,
    resolved_with TEXT
);
CREATE INDEX IF NOT EXISTS idx_conflict_status ON conflict(status);

CREATE TABLE IF NOT EXISTS audit_event (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    details TEXT NOT NULL
);
"#;

/// Opens (creating if necessary) the encrypted database file in Tauri's
/// per-app local-data directory, applies the SQLCipher key, and ensures
/// the schema above exists. Called once at startup from `lib.rs`.
pub fn init_db(app_handle: &AppHandle) -> rusqlite::Result<AppDb> {
    let data_dir = app_handle
        .path()
        .app_local_data_dir()
        .expect("app_local_data_dir should always resolve on a properly configured Tauri app");
    std::fs::create_dir_all(&data_dir).expect("failed to create app local data directory");

    let db_path = data_dir.join("rockfrost-desktop.sqlite3");
    let conn = Connection::open(db_path)?;

    let key = credentials::get_or_create_sqlcipher_key(app_handle)
        .expect("failed to obtain the SQLCipher database key from the OS credential store");
    // SQLCipher's key pragma must be the very first statement executed on
    // a fresh connection, before any other read/write, including schema
    // creation below.
    conn.pragma_update(None, "key", &key)?;
    conn.pragma_update(None, "foreign_keys", "ON")?;

    conn.execute_batch(SCHEMA_SQL)?;

    Ok(AppDb(Mutex::new(conn)))
}
