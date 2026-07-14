use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::AppHandle;

pub type BoxResult<T> = Result<T, Box<dyn std::error::Error>>;

/// A saved server connection (persisted to connections.json).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Connection {
    pub id: String,
    pub name: String,
    pub uri: String,
    pub color: String,
    pub created_at: i64,
    pub last_connected: Option<i64>,
    /// Databases the user chose to show in the sidebar. Empty = show all.
    #[serde(default)]
    pub visible_dbs: Vec<String>,
    /// Human-readable risk profile. Existing saved connections remain development.
    #[serde(default = "default_environment")]
    pub environment: String,
    /// Blocks every database mutation for this saved connection.
    #[serde(default)]
    pub read_only: bool,
}

fn default_environment() -> String {
    "development".into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AppSettings {
    pub language: String,
    /// "local" | "UTC" | "+HH:MM" | "-HH:MM"
    pub timezone: String,
    /// "iso" | "locale" | "custom"
    pub date_mode: String,
    pub date_format: String,
    pub default_page_size: u32,
    pub export_format: String,
    /// Run the default query automatically when a collection is opened.
    pub auto_execute: bool,
    /// Template for the initial query (supports `{coll}`). Empty = built-in.
    pub initial_script: String,
    /// Record document updates/replaces to collection history (for restore).
    pub record_updates: bool,
    /// Record inserted documents so they can be undone from collection history.
    pub record_inserts: bool,
    /// Record document deletions to collection history (for restore).
    pub record_deletes: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            language: "en".into(),
            timezone: "local".into(),
            date_mode: "iso".into(),
            date_format: "YYYY-MM-DD HH:mm:ss".into(),
            default_page_size: 50,
            export_format: "json".into(),
            auto_execute: true,
            initial_script: String::new(),
            record_updates: true,
            record_inserts: true,
            record_deletes: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpSettings {
    pub enabled: bool,
    pub port: u16,
    pub token: String,
}

impl Default for McpSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            port: 7900,
            token: uuid::Uuid::new_v4().to_string(),
        }
    }
}

pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

pub struct AppState {
    pub data_dir: PathBuf,
    pub saved: Mutex<Vec<Connection>>,
    pub clients: Mutex<HashMap<String, mongodb::Client>>,
    pub history: Mutex<rusqlite::Connection>,
    pub settings: Mutex<AppSettings>,
    pub mcp_settings: Mutex<McpSettings>,
    pub mcp_stop_tx: Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
    pub terminal_sessions: Mutex<HashMap<String, crate::terminal::TerminalSession>>,
    /// Kept for emitting events to the frontend in future iterations.
    #[allow(dead_code)]
    pub app: AppHandle,
}

impl AppState {
    pub fn new(app: AppHandle) -> BoxResult<Self> {
        let data_dir = dirs::data_dir()
            .unwrap_or_else(std::env::temp_dir)
            .join("tucano-db");
        std::fs::create_dir_all(&data_dir)?;

        let saved = load_json(&data_dir.join("connections.json")).unwrap_or_default();
        let settings = load_json(&data_dir.join("settings.json")).unwrap_or_default();
        let mcp_settings = load_json(&data_dir.join("mcp-settings.json")).unwrap_or_default();

        let history = crate::history::open(&data_dir.join("history.db"))?;

        Ok(Self {
            data_dir,
            saved: Mutex::new(saved),
            clients: Mutex::new(HashMap::new()),
            history: Mutex::new(history),
            settings: Mutex::new(settings),
            mcp_settings: Mutex::new(mcp_settings),
            mcp_stop_tx: Mutex::new(None),
            terminal_sessions: Mutex::new(HashMap::new()),
            app,
        })
    }

    pub fn persist_connections(&self) {
        let v = self.saved.lock().clone();
        let _ = save_json(&self.data_dir.join("connections.json"), &v);
    }

    pub fn persist_settings(&self) {
        let v = self.settings.lock().clone();
        let _ = save_json(&self.data_dir.join("settings.json"), &v);
    }

    pub fn persist_mcp(&self) {
        let v = self.mcp_settings.lock().clone();
        let _ = save_json(&self.data_dir.join("mcp-settings.json"), &v);
    }

    /// Return a cloned client for an open connection, or an error if not connected.
    pub fn client(&self, conn_id: &str) -> Result<mongodb::Client, String> {
        self.clients
            .lock()
            .get(conn_id)
            .cloned()
            .ok_or_else(|| "not connected".to_string())
    }

    /// Restores a saved Mongo connection on demand for local MCP reads.
    /// Connecting is not a data operation and does not bypass write safety.
    pub async fn client_or_connect(&self, conn_id: &str) -> Result<mongodb::Client, String> {
        if let Ok(client) = self.client(conn_id) {
            return Ok(client);
        }

        let uri = self
            .saved
            .lock()
            .iter()
            .find(|connection| connection.id == conn_id)
            .map(|connection| connection.uri.clone())
            .ok_or_else(|| "connection not found".to_string())?;
        let client = crate::connections::open_client(&uri).await?;
        self.clients.lock().insert(conn_id.to_string(), client.clone());
        if let Some(connection) = self
            .saved
            .lock()
            .iter_mut()
            .find(|connection| connection.id == conn_id)
        {
            connection.last_connected = Some(now_ms());
        }
        self.persist_connections();
        Ok(client)
    }

    /// Enforce the connection safety policy at the command boundary. UI controls
    /// are helpful, but they are not a security boundary for IPC callers.
    pub fn ensure_write_allowed(&self, conn_id: &str) -> Result<(), String> {
        let saved = self.saved.lock();
        let conn = saved
            .iter()
            .find(|connection| connection.id == conn_id)
            .ok_or_else(|| "connection not found".to_string())?;
        if conn.read_only {
            return Err(format!(
                "writes are disabled for the {} connection \"{}\"",
                conn.environment, conn.name
            ));
        }
        Ok(())
    }
}

fn load_json<T: for<'de> Deserialize<'de>>(path: &std::path::Path) -> Option<T> {
    let s = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&s).ok()
}

fn save_json<T: Serialize>(path: &std::path::Path, value: &T) -> std::io::Result<()> {
    let s = serde_json::to_string_pretty(value).unwrap_or_default();
    std::fs::write(path, s)
}
