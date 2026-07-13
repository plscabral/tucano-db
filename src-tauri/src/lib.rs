mod connections;
mod export;
mod history;
mod mcp_bridge;
mod mcp_install;
mod mcp_settings;
mod mongo;
mod overview;
mod schema;
mod settings;
mod state;

use state::AppState;
use std::sync::Arc;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "tucano_db_lib=info".into()),
        )
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let handle = app.handle().clone();
            let state = Arc::new(AppState::new(handle.clone()).expect("init state"));
            app.manage(state.clone());

            // Boot the MCP bridge if the user previously enabled it.
            let mcp = state.mcp_settings.lock().clone();
            if mcp.enabled {
                mcp_bridge::spawn(state.clone(), mcp.port, mcp.token);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // connections
            connections::list_connections,
            connections::active_connections,
            connections::add_connection,
            connections::update_connection,
            connections::set_visible_databases,
            connections::remove_connection,
            connections::test_connection,
            connections::connect,
            connections::disconnect,
            // topology + documents
            mongo::list_databases,
            mongo::list_collections,
            mongo::find_documents,
            mongo::aggregate,
            mongo::distinct,
            mongo::insert_document,
            mongo::update_document,
            mongo::delete_document,
            mongo::delete_many,
            mongo::create_collection,
            mongo::drop_collection,
            mongo::rename_collection,
            mongo::duplicate_collection,
            mongo::create_database,
            mongo::drop_database,
            mongo::list_indexes,
            mongo::create_index,
            mongo::drop_index,
            // schema / autocomplete
            schema::sample_fields,
            schema::analyze_schema,
            // overview
            overview::server_overview,
            // history
            history::list_history,
            history::get_history_entry,
            history::history_collections,
            history::restore_history_entry,
            history::delete_history_entry,
            history::clear_history,
            // settings
            settings::get_settings,
            settings::set_settings,
            // export
            export::export_documents,
            // mcp
            mcp_settings::get_mcp_settings,
            mcp_settings::set_mcp_settings,
            mcp_settings::rotate_mcp_token,
            mcp_install::list_mcp_clients,
            mcp_install::install_mcp_client,
            mcp_install::uninstall_mcp_client,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Tucano DB");
}
