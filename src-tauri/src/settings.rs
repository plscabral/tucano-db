use crate::state::{AppSettings, AppState};
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub fn get_settings(state: State<'_, Arc<AppState>>) -> AppSettings {
    state.settings.lock().clone()
}

#[tauri::command]
pub fn set_settings(state: State<'_, Arc<AppState>>, settings: AppSettings) {
    *state.settings.lock() = settings;
    state.persist_settings();
}
