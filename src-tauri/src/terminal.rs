//! Local interactive PTY sessions. The WebView can start the user's login
//! shell, already positioned in a Tucano-configured workspace.

use crate::state::AppState;
use parking_lot::Mutex;
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::fs;
use std::io::{Read, Write};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

type R<T> = Result<T, String>;

pub struct TerminalSession {
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
    child: Arc<Mutex<Box<dyn Child + Send + Sync>>>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TerminalOutput {
    session_id: String,
    data: String,
}

fn write_session_skills(state: &AppState) -> R<std::path::PathBuf> {
    let mcp = state.mcp_settings.lock().clone();
    if !mcp.enabled {
        return Err("Enable the Tucano MCP bridge in Settings before starting an AI terminal.".into());
    }
    let root = state.data_dir.join("agent-workspace");
    fs::create_dir_all(root.join(".claude/skills/tucano-db")).map_err(|e| e.to_string())?;
    fs::create_dir_all(root.join(".opencode/skills/tucano-db")).map_err(|e| e.to_string())?;
    fs::create_dir_all(root.join(".codex")).map_err(|e| e.to_string())?;
    fs::create_dir_all(root.join("shell")).map_err(|e| e.to_string())?;

    let instructions = r#"# Tucano DB Copilot

You are the in-product copilot for Tucano DB, a desktop MongoDB client. Your job is to help people understand data, design safe queries, analyze schema and indexes, and produce evidence-backed reports through the `tucano-db` MCP server.

## Operating rules

1. Begin every data task by identifying the target connection. Call `list_connections`. Never assume a connection when several are active; ask the user to choose or state the connection name you are using.
2. Before a non-trivial query, inspect databases and collections, then call `analyze_schema` and `list_indexes` for the target collection. Prefer small samples and bounded limits.
3. Use only the MCP tools for database reads. The bridge has no write tool and only accepts read-only editor queries: never claim to have inserted, updated, deleted, created, dropped, renamed, or indexed database data.
4. Write safety gate — create, edit, delete, migration, index changes and any destructive operation are always proposals, never actions. Do not run `mongosh`, database CLIs, shell commands, scripts, drivers, HTTP requests, or any workaround to modify a database. First present the exact proposed operation, target connection/database/collection, selection criteria, estimated impact, risks and rollback. Then require an explicit confirmation from the user in a separate message. Even after confirmation, direct the user to apply it through Tucano DB's own confirmation UI; do not perform the mutation yourself.
5. When the user asks to perform a read query, use `run_query_in_editor` after validating schema. This opens the target collection, shows the query in the Tucano editor and executes it visibly. Pass a complete expression such as `db.Person.find({ Name: { $regex: "Alexandre", $options: "i" } }).limit(50)`; a JSON filter object is accepted and normalized by Tucano as a safe fallback. Use `draft_query_in_editor` only when the user asks for a proposal without execution.
6. For reports, state the sources, filters, sampling/limits, time period, calculations, and caveats. If more than one connection is used, label every result by connection and never merge data silently.
7. Treat representative values as potentially sensitive. Do not repeat secrets, tokens, passwords, or unnecessary personal data in responses.
8. If the MCP bridge reports authentication or connectivity errors, explain the exact recovery step instead of inventing results.

## What you can help with

- Discovering databases, collections, document shape, field coverage and indexes.
- Building and explaining find filters, projections, sorts, aggregations and read-only performance checks.
- Comparing explicitly selected databases, producing summaries and report drafts.
- Suggesting index, schema, cleanup or migration plans as drafts for user approval.

## Response style

Be concise, explicit about scope and uncertainty, and use Portuguese when the user writes in Portuguese. Ask one focused clarification when target, period, or metric is ambiguous.
"#;
    fs::write(root.join("AGENTS.md"), instructions).map_err(|e| e.to_string())?;
    fs::write(root.join("CLAUDE.md"), instructions).map_err(|e| e.to_string())?;
    fs::write(root.join("TUCANO_COPILOT.md"), instructions).map_err(|e| e.to_string())?;
    fs::write(root.join(".claude/skills/tucano-db/SKILL.md"), instructions).map_err(|e| e.to_string())?;
    fs::write(root.join(".opencode/skills/tucano-db/SKILL.md"), instructions).map_err(|e| e.to_string())?;

    let bridge = format!("http://127.0.0.1:{}", mcp.port);
    // In development, launch the MCP bridge from this checkout so every new
    // local tool is available immediately. Installed builds retain the
    // published npx package fallback until the package is bundled as a sidecar.
    let local_mcp = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../packages/tucano-db-mcp/bin/tucano-db-mcp.js");
    let (mcp_command, mcp_args) = if local_mcp.is_file() {
        ("node".to_string(), vec![local_mcp.to_string_lossy().into_owned()])
    } else {
        ("npx".to_string(), vec!["-y".to_string(), "tucano-db-mcp".to_string()])
    };
    let mcp_json = serde_json::json!({"mcpServers": {"tucano-db": {"command": mcp_command, "args": mcp_args, "env": {"TUCANO_DB_BRIDGE": bridge, "TUCANO_DB_TOKEN": mcp.token}}}});
    fs::write(root.join(".mcp.json"), serde_json::to_string_pretty(&mcp_json).unwrap()).map_err(|e| e.to_string())?;
    let mut opencode_command = vec![mcp_command.clone()];
    opencode_command.extend(mcp_args.clone());
    fs::write(root.join("opencode.json"), serde_json::to_string_pretty(&serde_json::json!({"mcp": {"tucano-db": {"type": "local", "command": opencode_command, "environment": {"TUCANO_DB_BRIDGE": format!("http://127.0.0.1:{}", mcp.port), "TUCANO_DB_TOKEN": mcp.token}}}})).unwrap()).map_err(|e| e.to_string())?;
    fs::write(root.join(".codex/config.toml"), format!("[mcp_servers.tucano-db]\ncommand = {}\nargs = {}\n\n[mcp_servers.tucano-db.env]\nTUCANO_DB_BRIDGE = \"http://127.0.0.1:{}\"\nTUCANO_DB_TOKEN = \"{}\"\n", serde_json::to_string(&mcp_command).unwrap(), serde_json::to_string(&mcp_args).unwrap(), mcp.port, mcp.token)).map_err(|e| e.to_string())?;
    let zshrc = r#"[[ -r "$HOME/.zshrc" ]] && source "$HOME/.zshrc"
claude() {
  command claude --append-system-prompt-file "$TUCANO_DB_SYSTEM_PROMPT" --mcp-config "$TUCANO_DB_MCP_CONFIG" "$@"
}
"#;
    fs::write(root.join("shell/.zshrc"), zshrc).map_err(|e| e.to_string())?;
    Ok(root)
}

#[tauri::command]
pub fn start_ai_terminal(
    state: State<'_, Arc<AppState>>,
    app: AppHandle,
    cols: u16,
    rows: u16,
) -> R<String> {
    let workspace = write_session_skills(state.inner())?;
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize { rows: rows.max(1), cols: cols.max(1), pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())?;
    let shell = std::env::var("SHELL")
        .ok()
        .filter(|path| !path.trim().is_empty())
        .unwrap_or_else(|| "/bin/sh".to_string());
    let mut cmd = CommandBuilder::new(&shell);
    // Start where the user normally works. The generated workspace remains
    // available through TUCANO_DB_SKILL without taking over their shell.
    cmd.cwd(dirs::home_dir().unwrap_or_else(|| workspace.clone()));
    let mcp = state.mcp_settings.lock().clone();
    cmd.env("TUCANO_DB_BRIDGE", format!("http://127.0.0.1:{}", mcp.port));
    cmd.env("TUCANO_DB_TOKEN", mcp.token);
    cmd.env("TUCANO_DB_SKILL", workspace.join("AGENTS.md"));
    cmd.env("TUCANO_DB_SYSTEM_PROMPT", workspace.join("TUCANO_COPILOT.md"));
    cmd.env("TUCANO_DB_MCP_CONFIG", workspace.join(".mcp.json"));
    cmd.env("TUCANO_DB_WORKSPACE", &workspace);
    if shell.ends_with("zsh") {
        cmd.env("ZDOTDIR", workspace.join("shell"));
    }
    // Interactive programs rely on TERM to emit ANSI control sequences. In
    // particular, `clear` is a no-op when the PTY inherits an unknown terminal.
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    // The desktop process may inherit NO_COLOR=1 from its launcher. Claude
    // respects it, so remove it for the interactive terminal and explicitly
    // advertise color support to Node-based CLIs.
    cmd.env_remove("NO_COLOR");
    cmd.env("FORCE_COLOR", "3");
    let child = pair.slave.spawn_command(cmd).map_err(|e| format!("Could not start shell {shell}: {e}"))?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let session_id = uuid::Uuid::new_v4().to_string();
    let output_id = session_id.clone();
    std::thread::spawn(move || {
        let mut buffer = [0_u8; 8192];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) | Err(_) => break,
                Ok(count) => {
                    let _ = app.emit("tucano://terminal-output", TerminalOutput { session_id: output_id.clone(), data: String::from_utf8_lossy(&buffer[..count]).into_owned() });
                }
            }
        }
    });
    state.terminal_sessions.lock().insert(session_id.clone(), TerminalSession {
        writer: Arc::new(Mutex::new(writer)),
        master: Arc::new(Mutex::new(pair.master)),
        child: Arc::new(Mutex::new(child)),
    });
    Ok(session_id)
}

#[tauri::command]
pub fn write_ai_terminal(state: State<'_, Arc<AppState>>, session_id: String, data: String) -> R<()> {
    let sessions = state.terminal_sessions.lock();
    let session = sessions.get(&session_id).ok_or("terminal session not found")?;
    let mut writer = session.writer.lock();
    writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
    writer.flush().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn resize_ai_terminal(state: State<'_, Arc<AppState>>, session_id: String, cols: u16, rows: u16) -> R<()> {
    let sessions = state.terminal_sessions.lock();
    let session = sessions.get(&session_id).ok_or("terminal session not found")?;
    let result = session
        .master
        .lock()
        .resize(PtySize { rows: rows.max(1), cols: cols.max(1), pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string());
    result
}

#[tauri::command]
pub fn stop_ai_terminal(state: State<'_, Arc<AppState>>, session_id: String) -> R<()> {
    let session = state.terminal_sessions.lock().remove(&session_id).ok_or("terminal session not found")?;
    let result = session.child.lock().kill().map_err(|e| e.to_string());
    result
}
