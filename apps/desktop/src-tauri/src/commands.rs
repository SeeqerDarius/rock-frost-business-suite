//! Tauri commands invoked from `src/db/tauri-database.ts`. One function
//! per `LocalDatabase` interface method (`src/db/local-database.ts`) — the
//! command name and argument shape here must match that file's `invoke()`
//! calls exactly. See db.rs's module doc comment for verification status.

use rusqlite::{params, OptionalExtension};
use serde_json::Value as Json;
use tauri::State;

use crate::db::AppDb;
use crate::models::*;

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn json_to_text(value: &Json) -> String {
    value.to_string()
}

fn text_to_json(text: &str) -> Json {
    serde_json::from_str(text).unwrap_or(Json::Null)
}

fn string_list_to_json(list: &[String]) -> String {
    serde_json::to_string(list).unwrap_or_else(|_| "[]".to_string())
}

fn json_to_string_list(text: &str) -> Vec<String> {
    serde_json::from_str(text).unwrap_or_default()
}

// --- Device metadata ---

#[tauri::command]
pub fn db_get_active_device(db: State<AppDb>) -> Result<Option<DeviceRecord>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT device_id, device_name, organization_id, user_id, user_name, enabled_module_keys, activated_at, deactivated_at, deactivation_reason
         FROM device ORDER BY activated_at DESC LIMIT 1",
        [],
        |row| {
            Ok(DeviceRecord {
                device_id: row.get(0)?,
                device_name: row.get(1)?,
                organization_id: row.get(2)?,
                user_id: row.get(3)?,
                user_name: row.get(4)?,
                enabled_module_keys: json_to_string_list(&row.get::<_, String>(5)?),
                activated_at: row.get(6)?,
                deactivated_at: row.get(7)?,
                deactivation_reason: row.get(8)?,
            })
        },
    )
    .optional()
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn db_save_device(db: State<AppDb>, device: DeviceRecord) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO device (device_id, device_name, organization_id, user_id, user_name, enabled_module_keys, activated_at, deactivated_at, deactivation_reason)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
         ON CONFLICT(device_id) DO UPDATE SET
           device_name = excluded.device_name,
           organization_id = excluded.organization_id,
           user_id = excluded.user_id,
           user_name = excluded.user_name,
           enabled_module_keys = excluded.enabled_module_keys,
           activated_at = excluded.activated_at,
           deactivated_at = excluded.deactivated_at,
           deactivation_reason = excluded.deactivation_reason",
        params![
            device.device_id,
            device.device_name,
            device.organization_id,
            device.user_id,
            device.user_name,
            string_list_to_json(&device.enabled_module_keys),
            device.activated_at,
            device.deactivated_at,
            device.deactivation_reason,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn db_deactivate_device(db: State<AppDb>, device_id: String, reason: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE device SET deactivated_at = ?1, deactivation_reason = ?2 WHERE device_id = ?3",
        params![now_iso(), reason, device_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// --- Cached business records ---

fn map_cached_record(row: &rusqlite::Row) -> rusqlite::Result<CachedRecord> {
    Ok(CachedRecord {
        module_key: row.get(0)?,
        entity_type: row.get(1)?,
        entity_id: row.get(2)?,
        version: row.get(3)?,
        payload: text_to_json(&row.get::<_, String>(4)?),
        has_pending_local_change: row.get::<_, i64>(5)? != 0,
        updated_at: row.get(6)?,
        updated_by_user_id: row.get(7)?,
        updated_by_user_name: row.get(8)?,
    })
}

const CACHED_RECORD_COLUMNS: &str =
    "module_key, entity_type, entity_id, version, payload, has_pending_local_change, updated_at, updated_by_user_id, updated_by_user_name";

#[tauri::command]
pub fn db_get_cached_record(
    db: State<AppDb>,
    module_key: String,
    entity_type: String,
    entity_id: String,
) -> Result<Option<CachedRecord>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.query_row(
        &format!("SELECT {CACHED_RECORD_COLUMNS} FROM cached_record WHERE module_key = ?1 AND entity_type = ?2 AND entity_id = ?3"),
        params![module_key, entity_type, entity_id],
        map_cached_record,
    )
    .optional()
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn db_list_cached_records(db: State<AppDb>, module_key: String, entity_type: String) -> Result<Vec<CachedRecord>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(&format!("SELECT {CACHED_RECORD_COLUMNS} FROM cached_record WHERE module_key = ?1 AND entity_type = ?2"))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![module_key, entity_type], map_cached_record)
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn db_upsert_cached_record(db: State<AppDb>, record: CachedRecord) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO cached_record (module_key, entity_type, entity_id, version, payload, has_pending_local_change, updated_at, updated_by_user_id, updated_by_user_name)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
         ON CONFLICT(module_key, entity_type, entity_id) DO UPDATE SET
           version = excluded.version,
           payload = excluded.payload,
           has_pending_local_change = excluded.has_pending_local_change,
           updated_at = excluded.updated_at,
           updated_by_user_id = excluded.updated_by_user_id,
           updated_by_user_name = excluded.updated_by_user_name",
        params![
            record.module_key,
            record.entity_type,
            record.entity_id,
            record.version,
            json_to_text(&record.payload),
            record.has_pending_local_change as i64,
            record.updated_at,
            record.updated_by_user_id,
            record.updated_by_user_name,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn db_delete_cached_record(db: State<AppDb>, module_key: String, entity_type: String, entity_id: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM cached_record WHERE module_key = ?1 AND entity_type = ?2 AND entity_id = ?3",
        params![module_key, entity_type, entity_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn db_purge_all_cached_records(db: State<AppDb>) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM cached_record", []).map_err(|e| e.to_string())?;
    Ok(())
}

// --- Mutation queue ---

fn map_queued_mutation(row: &rusqlite::Row) -> rusqlite::Result<QueuedMutationRecord> {
    Ok(QueuedMutationRecord {
        id: row.get(0)?,
        mutation_id: row.get(1)?,
        organization_id: row.get(2)?,
        module_key: row.get(3)?,
        entity_type: row.get(4)?,
        entity_id: row.get(5)?,
        base_version: row.get(6)?,
        operation: row.get(7)?,
        changed_at: row.get(8)?,
        payload: text_to_json(&row.get::<_, String>(9)?),
        status: row.get(10)?,
        attempt_count: row.get(11)?,
        last_attempt_at: row.get(12)?,
        rejection_reason: row.get(13)?,
    })
}

const QUEUED_MUTATION_COLUMNS: &str =
    "id, mutation_id, organization_id, module_key, entity_type, entity_id, base_version, operation, changed_at, payload, status, attempt_count, last_attempt_at, rejection_reason";

#[tauri::command]
pub fn db_enqueue_mutation(db: State<AppDb>, mutation: NewQueuedMutation) -> Result<QueuedMutationRecord, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    // Idempotent on mutationId — a retried logical mutation reusing the
    // same client-generated id returns the existing row rather than
    // inserting a duplicate. See src/sync/mutation-queue.ts.
    if let Some(existing) = conn
        .query_row(
            &format!("SELECT {QUEUED_MUTATION_COLUMNS} FROM queued_mutation WHERE mutation_id = ?1"),
            params![mutation.mutation_id],
            map_queued_mutation,
        )
        .optional()
        .map_err(|e| e.to_string())?
    {
        return Ok(existing);
    }

    conn.execute(
        "INSERT INTO queued_mutation (mutation_id, organization_id, module_key, entity_type, entity_id, base_version, operation, changed_at, payload)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            mutation.mutation_id,
            mutation.organization_id,
            mutation.module_key,
            mutation.entity_type,
            mutation.entity_id,
            mutation.base_version,
            mutation.operation,
            mutation.changed_at,
            json_to_text(&mutation.payload),
        ],
    )
    .map_err(|e| e.to_string())?;

    conn.query_row(
        &format!("SELECT {QUEUED_MUTATION_COLUMNS} FROM queued_mutation WHERE mutation_id = ?1"),
        params![mutation.mutation_id],
        map_queued_mutation,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn db_list_queued_mutations(db: State<AppDb>, status: Option<String>) -> Result<Vec<QueuedMutationRecord>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {QUEUED_MUTATION_COLUMNS} FROM queued_mutation WHERE (?1 IS NULL OR status = ?1) ORDER BY id ASC"
        ))
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params![status], map_queued_mutation).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn db_get_queued_mutation(db: State<AppDb>, mutation_id: String) -> Result<Option<QueuedMutationRecord>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.query_row(
        &format!("SELECT {QUEUED_MUTATION_COLUMNS} FROM queued_mutation WHERE mutation_id = ?1"),
        params![mutation_id],
        map_queued_mutation,
    )
    .optional()
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn db_update_mutation_status(
    db: State<AppDb>,
    mutation_id: String,
    status: String,
    fields: MutationStatusUpdateFields,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE queued_mutation SET
           status = ?1,
           attempt_count = COALESCE(?2, attempt_count),
           last_attempt_at = COALESCE(?3, last_attempt_at),
           rejection_reason = COALESCE(?4, rejection_reason)
         WHERE mutation_id = ?5",
        params![status, fields.attempt_count, fields.last_attempt_at, fields.rejection_reason, mutation_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn db_count_pending_mutations(db: State<AppDb>) -> Result<i64, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT COUNT(*) FROM queued_mutation WHERE status IN ('pending', 'sending')",
        [],
        |row| row.get(0),
    )
    .map_err(|e| e.to_string())
}

// --- Sync cursors ---

#[tauri::command]
pub fn db_get_sync_cursor(db: State<AppDb>, module_key: String) -> Result<Option<String>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.query_row("SELECT cursor FROM sync_cursor WHERE module_key = ?1", params![module_key], |row| row.get(0))
        .optional()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn db_set_sync_cursor(db: State<AppDb>, module_key: String, cursor: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO sync_cursor (module_key, cursor, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(module_key) DO UPDATE SET cursor = excluded.cursor, updated_at = excluded.updated_at",
        params![module_key, cursor, now_iso()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// --- Conflicts ---

fn map_conflict(row: &rusqlite::Row) -> rusqlite::Result<ConflictRecord> {
    Ok(ConflictRecord {
        conflict_id: row.get(0)?,
        module_key: row.get(1)?,
        entity_type: row.get(2)?,
        entity_id: row.get(3)?,
        allowed_resolutions: json_to_string_list(&row.get::<_, String>(4)?),
        local_value: text_to_json(&row.get::<_, String>(5)?),
        local_changed_at: row.get(6)?,
        local_changed_by_user_name: row.get(7)?,
        cloud_value: text_to_json(&row.get::<_, String>(8)?),
        cloud_changed_at: row.get(9)?,
        cloud_changed_by_user_name: row.get(10)?,
        status: row.get(11)?,
        detected_at: row.get(12)?,
        resolved_at: row.get(13)?,
        resolved_with: row.get(14)?,
    })
}

const CONFLICT_COLUMNS: &str = "conflict_id, module_key, entity_type, entity_id, allowed_resolutions, local_value, local_changed_at, local_changed_by_user_name, cloud_value, cloud_changed_at, cloud_changed_by_user_name, status, detected_at, resolved_at, resolved_with";

#[tauri::command]
pub fn db_upsert_conflict(db: State<AppDb>, conflict: ConflictRecord) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO conflict (conflict_id, module_key, entity_type, entity_id, allowed_resolutions, local_value, local_changed_at, local_changed_by_user_name, cloud_value, cloud_changed_at, cloud_changed_by_user_name, status, detected_at, resolved_at, resolved_with)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
         ON CONFLICT(conflict_id) DO UPDATE SET
           allowed_resolutions = excluded.allowed_resolutions,
           local_value = excluded.local_value,
           local_changed_at = excluded.local_changed_at,
           local_changed_by_user_name = excluded.local_changed_by_user_name,
           cloud_value = excluded.cloud_value,
           cloud_changed_at = excluded.cloud_changed_at,
           cloud_changed_by_user_name = excluded.cloud_changed_by_user_name,
           status = excluded.status,
           detected_at = excluded.detected_at,
           resolved_at = excluded.resolved_at,
           resolved_with = excluded.resolved_with",
        params![
            conflict.conflict_id,
            conflict.module_key,
            conflict.entity_type,
            conflict.entity_id,
            string_list_to_json(&conflict.allowed_resolutions),
            json_to_text(&conflict.local_value),
            conflict.local_changed_at,
            conflict.local_changed_by_user_name,
            json_to_text(&conflict.cloud_value),
            conflict.cloud_changed_at,
            conflict.cloud_changed_by_user_name,
            conflict.status,
            conflict.detected_at,
            conflict.resolved_at,
            conflict.resolved_with,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn db_list_conflicts(db: State<AppDb>, status: Option<String>) -> Result<Vec<ConflictRecord>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(&format!("SELECT {CONFLICT_COLUMNS} FROM conflict WHERE (?1 IS NULL OR status = ?1)"))
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params![status], map_conflict).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn db_get_conflict(db: State<AppDb>, conflict_id: String) -> Result<Option<ConflictRecord>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.query_row(
        &format!("SELECT {CONFLICT_COLUMNS} FROM conflict WHERE conflict_id = ?1"),
        params![conflict_id],
        map_conflict,
    )
    .optional()
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn db_resolve_conflict(db: State<AppDb>, conflict_id: String, resolved_with: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE conflict SET status = 'resolved', resolved_at = ?1, resolved_with = ?2 WHERE conflict_id = ?3",
        params![now_iso(), resolved_with, conflict_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// --- Audit trail ---

#[tauri::command]
pub fn db_append_audit_event(db: State<AppDb>, event_type: String, details: Json) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO audit_event (event_type, occurred_at, details) VALUES (?1, ?2, ?3)",
        params![event_type, now_iso(), json_to_text(&details)],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn db_list_audit_events(db: State<AppDb>, limit: i64) -> Result<Vec<AuditEventRecord>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, event_type, occurred_at, details FROM audit_event ORDER BY id DESC LIMIT ?1")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![limit], |row| {
            Ok(AuditEventRecord {
                id: row.get(0)?,
                event_type: row.get(1)?,
                occurred_at: row.get(2)?,
                details: text_to_json(&row.get::<_, String>(3)?),
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

// --- Lifecycle ---

#[tauri::command]
pub fn db_reset_all(db: State<AppDb>) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute_batch(
        "DELETE FROM device;
         DELETE FROM cached_record;
         DELETE FROM queued_mutation;
         DELETE FROM sync_cursor;
         DELETE FROM conflict;
         DELETE FROM audit_event;",
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
