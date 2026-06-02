use crate::mcp_bridge;
use crate::state::{AppState, McpSettings};
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub fn get_mcp_settings(state: State<'_, Arc<AppState>>) -> McpSettings {
    state.mcp_settings.lock().clone()
}

#[tauri::command]
pub fn set_mcp_settings(state: State<'_, Arc<AppState>>, settings: McpSettings) {
    let was_enabled = state.mcp_settings.lock().enabled;
    *state.mcp_settings.lock() = settings.clone();
    state.persist_mcp();

    // Restart the bridge to reflect the new settings.
    mcp_bridge::stop(state.inner());
    if was_enabled {
        // give the old listener a moment is unnecessary; bind on a fresh task.
    }
    if settings.enabled {
        mcp_bridge::spawn(state.inner().clone(), settings.port, settings.token);
    }
}

#[tauri::command]
pub fn rotate_mcp_token(state: State<'_, Arc<AppState>>) -> String {
    let token = uuid::Uuid::new_v4().to_string();
    {
        let mut s = state.mcp_settings.lock();
        s.token = token.clone();
    }
    state.persist_mcp();
    let s = state.mcp_settings.lock().clone();
    mcp_bridge::stop(state.inner());
    if s.enabled {
        mcp_bridge::spawn(state.inner().clone(), s.port, s.token.clone());
    }
    token
}
