mod commands;
mod credentials;
mod db;
mod models;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let database = db::init_db(app.handle())?;
            app.manage(database);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::db_get_active_device,
            commands::db_save_device,
            commands::db_deactivate_device,
            commands::db_get_cached_record,
            commands::db_list_cached_records,
            commands::db_upsert_cached_record,
            commands::db_delete_cached_record,
            commands::db_purge_all_cached_records,
            commands::db_enqueue_mutation,
            commands::db_list_queued_mutations,
            commands::db_get_queued_mutation,
            commands::db_update_mutation_status,
            commands::db_count_pending_mutations,
            commands::db_get_sync_cursor,
            commands::db_set_sync_cursor,
            commands::db_upsert_conflict,
            commands::db_list_conflicts,
            commands::db_get_conflict,
            commands::db_resolve_conflict,
            commands::db_append_audit_event,
            commands::db_list_audit_events,
            commands::db_reset_all,
            credentials::credentials_get,
            credentials::credentials_set,
            credentials::credentials_delete,
            credentials::credentials_clear,
        ])
        .run(tauri::generate_context!())
        .expect("error while running the Rock Frost desktop application");
}
