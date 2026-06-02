//! Install / uninstall the Tucano DB MCP server into supported clients:
//! Claude Desktop & Claude Code (JSON `mcpServers`), OpenCode (JSON `mcp`) and
//! Codex CLI (TOML `mcp_servers`).

use crate::state::AppState;
use serde::Serialize;
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::State;
use toml_edit::{value, Array, DocumentMut, Item, Table};

type R<T> = Result<T, String>;

const ENTRY: &str = "tucano-db";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpClient {
    pub id: String,
    pub name: String,
    pub installed: bool,
    pub config_path: String,
}

fn home() -> Option<PathBuf> {
    dirs::home_dir()
}

fn client_path(id: &str) -> Option<PathBuf> {
    let h = home()?;
    match id {
        "claude-desktop" => {
            #[cfg(target_os = "macos")]
            {
                Some(h.join("Library/Application Support/Claude/claude_desktop_config.json"))
            }
            #[cfg(target_os = "windows")]
            {
                std::env::var_os("APPDATA").map(|a| PathBuf::from(a).join("Claude/claude_desktop_config.json"))
            }
            #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
            {
                Some(h.join(".config/Claude/claude_desktop_config.json"))
            }
        }
        "claude-code" => Some(h.join(".claude.json")),
        "codex" => Some(h.join(".codex/config.toml")),
        "opencode" => Some(h.join(".config/opencode/opencode.json")),
        _ => None,
    }
}

const CLIENTS: [(&str, &str); 4] = [
    ("claude-desktop", "Claude Desktop"),
    ("claude-code", "Claude Code"),
    ("codex", "Codex CLI"),
    ("opencode", "OpenCode"),
];

// ── JSON helpers ───────────────────────────────────────────────────────────

fn read_json(path: &PathBuf) -> Value {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_else(|| json!({}))
}

fn write_json(path: &PathBuf, v: &Value) -> R<()> {
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let s = serde_json::to_string_pretty(v).map_err(|e| e.to_string())?;
    std::fs::write(path, s + "\n").map_err(|e| e.to_string())
}

fn read_toml(path: &PathBuf) -> DocumentMut {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| s.parse::<DocumentMut>().ok())
        .unwrap_or_default()
}

fn write_toml(path: &PathBuf, doc: &DocumentMut) -> R<()> {
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    std::fs::write(path, doc.to_string()).map_err(|e| e.to_string())
}

fn env_json(port: u16, token: &str) -> Value {
    json!({
        "TUCANO_DB_BRIDGE": format!("http://127.0.0.1:{port}"),
        "TUCANO_DB_TOKEN": token,
    })
}

// ── Status ─────────────────────────────────────────────────────────────────

fn is_installed(id: &str, path: &PathBuf) -> bool {
    if !path.exists() {
        return false;
    }
    match id {
        "claude-desktop" | "claude-code" => read_json(path)
            .get("mcpServers")
            .and_then(|m| m.get(ENTRY))
            .is_some(),
        "opencode" => read_json(path).get("mcp").and_then(|m| m.get(ENTRY)).is_some(),
        "codex" => read_toml(path)
            .get("mcp_servers")
            .and_then(|t| t.as_table())
            .map(|t| t.contains_key(ENTRY))
            .unwrap_or(false),
        _ => false,
    }
}

fn status_all() -> Vec<McpClient> {
    CLIENTS
        .iter()
        .filter_map(|(id, name)| {
            let path = client_path(id)?;
            Some(McpClient {
                id: id.to_string(),
                name: name.to_string(),
                installed: is_installed(id, &path),
                config_path: path.to_string_lossy().to_string(),
            })
        })
        .collect()
}

// ── Commands ───────────────────────────────────────────────────────────────

#[tauri::command]
pub fn list_mcp_clients() -> Vec<McpClient> {
    status_all()
}

#[tauri::command]
pub fn install_mcp_client(state: State<'_, Arc<AppState>>, id: String) -> R<()> {
    let mcp = state.mcp_settings.lock().clone();
    let path = client_path(&id).ok_or("unknown client")?;

    match id.as_str() {
        "claude-desktop" | "claude-code" => {
            let mut root = read_json(&path);
            if !root.is_object() {
                root = json!({});
            }
            let servers = root
                .as_object_mut()
                .unwrap()
                .entry("mcpServers")
                .or_insert_with(|| json!({}));
            if let Some(map) = servers.as_object_mut() {
                map.insert(
                    ENTRY.to_string(),
                    json!({ "command": "npx", "args": ["-y", "tucano-db-mcp"], "env": env_json(mcp.port, &mcp.token) }),
                );
            }
            write_json(&path, &root)
        }
        "opencode" => {
            let mut root = read_json(&path);
            if !root.is_object() {
                root = json!({});
            }
            let obj = root.as_object_mut().unwrap();
            obj.entry("$schema")
                .or_insert_with(|| Value::String("https://opencode.ai/config.json".into()));
            let mcp_map = obj.entry("mcp").or_insert_with(|| json!({}));
            if let Some(map) = mcp_map.as_object_mut() {
                map.insert(
                    ENTRY.to_string(),
                    json!({
                        "type": "local",
                        "command": ["npx", "-y", "tucano-db-mcp"],
                        "enabled": true,
                        "environment": env_json(mcp.port, &mcp.token),
                    }),
                );
            }
            write_json(&path, &root)
        }
        "codex" => {
            let mut doc = read_toml(&path);
            if !doc.contains_key("mcp_servers") {
                doc["mcp_servers"] = Item::Table(Table::new());
            }
            let servers = doc["mcp_servers"]
                .as_table_mut()
                .ok_or("mcp_servers is not a table")?;
            servers.set_implicit(true);
            let mut entry = Table::new();
            entry["command"] = value("npx");
            let mut args = Array::new();
            args.push("-y");
            args.push("tucano-db-mcp");
            entry["args"] = value(args);
            let mut env_tbl = toml_edit::InlineTable::new();
            env_tbl.insert("TUCANO_DB_BRIDGE", format!("http://127.0.0.1:{}", mcp.port).into());
            env_tbl.insert("TUCANO_DB_TOKEN", mcp.token.clone().into());
            entry["env"] = value(env_tbl);
            servers.insert(ENTRY, Item::Table(entry));
            write_toml(&path, &doc)
        }
        _ => Err("unknown client".into()),
    }
}

#[tauri::command]
pub fn uninstall_mcp_client(id: String) -> R<()> {
    let path = client_path(&id).ok_or("unknown client")?;
    if !path.exists() {
        return Ok(());
    }
    match id.as_str() {
        "claude-desktop" | "claude-code" => {
            let mut root = read_json(&path);
            if let Some(m) = root.get_mut("mcpServers").and_then(|v| v.as_object_mut()) {
                m.remove(ENTRY);
            }
            write_json(&path, &root)
        }
        "opencode" => {
            let mut root = read_json(&path);
            if let Some(m) = root.get_mut("mcp").and_then(|v| v.as_object_mut()) {
                m.remove(ENTRY);
            }
            write_json(&path, &root)
        }
        "codex" => {
            let mut doc = read_toml(&path);
            if let Some(t) = doc.get_mut("mcp_servers").and_then(|t| t.as_table_mut()) {
                t.remove(ENTRY);
            }
            write_toml(&path, &doc)
        }
        _ => Err("unknown client".into()),
    }
}
