//! Rust-side mirrors of the TypeScript types in `src/db/schema.ts`. Field
//! names and shapes must stay in lockstep with that file — this is the
//! wire contract for every `invoke()` call in `src/db/tauri-database.ts`.
//! Unverified in this environment; see `CLAUDE_HANDOFF.md`.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceRecord {
    pub device_id: String,
    pub device_name: String,
    pub organization_id: String,
    pub user_id: String,
    pub user_name: String,
    pub enabled_module_keys: Vec<String>,
    pub activated_at: String,
    pub deactivated_at: Option<String>,
    pub deactivation_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CachedRecord {
    pub module_key: String,
    pub entity_type: String,
    pub entity_id: String,
    pub version: i64,
    /// Stored as opaque JSON text in SQLite (see db.rs) — this app's Rust
    /// side never needs to interpret a module's payload shape, only
    /// persist and return it verbatim.
    pub payload: serde_json::Value,
    pub has_pending_local_change: bool,
    pub updated_at: String,
    pub updated_by_user_id: Option<String>,
    pub updated_by_user_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueuedMutationRecord {
    pub id: i64,
    pub mutation_id: String,
    pub organization_id: String,
    pub module_key: String,
    pub entity_type: String,
    pub entity_id: String,
    pub base_version: Option<i64>,
    pub operation: String,
    pub changed_at: String,
    pub payload: serde_json::Value,
    pub status: String,
    pub attempt_count: i64,
    pub last_attempt_at: Option<String>,
    pub rejection_reason: Option<String>,
}

/// Shape of the object `db.enqueueMutation()` sends — everything
/// `QueuedMutationRecord` has except the server-assigned/derived fields.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewQueuedMutation {
    pub mutation_id: String,
    pub organization_id: String,
    pub module_key: String,
    pub entity_type: String,
    pub entity_id: String,
    pub base_version: Option<i64>,
    pub operation: String,
    pub changed_at: String,
    pub payload: serde_json::Value,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MutationStatusUpdateFields {
    pub attempt_count: Option<i64>,
    pub last_attempt_at: Option<String>,
    pub rejection_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictRecord {
    pub conflict_id: String,
    pub module_key: String,
    pub entity_type: String,
    pub entity_id: String,
    pub allowed_resolutions: Vec<String>,
    pub local_value: serde_json::Value,
    pub local_changed_at: String,
    pub local_changed_by_user_name: Option<String>,
    pub cloud_value: serde_json::Value,
    pub cloud_changed_at: String,
    pub cloud_changed_by_user_name: Option<String>,
    pub status: String,
    pub detected_at: String,
    pub resolved_at: Option<String>,
    pub resolved_with: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditEventRecord {
    pub id: i64,
    pub event_type: String,
    pub occurred_at: String,
    pub details: serde_json::Value,
}
