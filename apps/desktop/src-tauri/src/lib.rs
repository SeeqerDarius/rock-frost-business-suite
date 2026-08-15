mod commands;
mod credentials;
mod db;
mod models;

use std::io::Write;
use tauri::Manager;

fn startup_log(message: &str) {
    let log_dir = std::env::var_os("LOCALAPPDATA")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(std::env::temp_dir)
        .join("com.rockfrostgroup.desktop");
    let _ = std::fs::create_dir_all(&log_dir);
    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_dir.join("startup.log"))
    {
        let _ = writeln!(file, "{} {}", chrono::Utc::now().to_rfc3339(), message);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    startup_log("native startup began");
    let result = tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            startup_log("tauri setup began");
            let database = db::init_db(app.handle())?;
            app.manage(database);
            startup_log("encrypted database initialized");
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
        .run(tauri::generate_context!());

    match result {
        Ok(()) => startup_log("tauri event loop exited normally"),
        Err(error) => {
            startup_log(&format!("tauri startup failed: {error}"));
            panic!("error while running the Rock Frost desktop application: {error}");
        }
    }
}
