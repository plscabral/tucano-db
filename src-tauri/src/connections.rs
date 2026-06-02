use crate::state::{now_ms, AppState, Connection};
use bson::doc;
use std::sync::Arc;
use tauri::State;

type R<T> = Result<T, String>;

async fn open_client(uri: &str) -> R<mongodb::Client> {
    use mongodb::options::{ClientOptions, ResolverConfig};
    use std::time::Duration;

    // For `mongodb+srv://` the driver does a DNS SRV lookup using the system
    // resolver, which on macOS/VPN setups can fail to parse the nameserver
    // ("failed to parse nameserver address"). Force a reliable public resolver
    // (Cloudflare) so SRV resolution works regardless of the system config.
    // Plain `mongodb://` URIs don't use the resolver, so this is harmless there.
    let mut options = ClientOptions::parse(uri)
        .resolver_config(ResolverConfig::cloudflare())
        .await
        .map_err(|e| format!("invalid connection string: {e}"))?;

    // Fail fast instead of hanging on the driver's 30s default. Only override
    // when the user hasn't pinned their own timeout in the URI.
    if options.server_selection_timeout.is_none() {
        options.server_selection_timeout = Some(Duration::from_secs(8));
    }
    if options.connect_timeout.is_none() {
        options.connect_timeout = Some(Duration::from_secs(8));
    }
    if options.app_name.is_none() {
        options.app_name = Some("tucano-db".to_string());
    }

    let client = mongodb::Client::with_options(options)
        .map_err(|e| format!("invalid connection string: {e}"))?;

    // Ping so we fail fast on unreachable/unauthorized servers.
    client
        .database("admin")
        .run_command(doc! { "ping": 1 })
        .await
        .map_err(|e| friendly_conn_error(uri, &e))?;
    Ok(client)
}

/// Turn the MongoDB driver's verbose, low-level errors into a short, actionable
/// message. The raw "Server selection timeout: None of the available servers
/// suitable for criteria ReadPreference(...)" is unreadable for users and almost
/// always means the host is unreachable or a replica set is advertising
/// hostnames the client can't resolve.
fn friendly_conn_error(uri: &str, e: &mongodb::error::Error) -> String {
    use mongodb::error::ErrorKind;

    match e.kind.as_ref() {
        ErrorKind::ServerSelection { .. } => {
            // Multiple hosts (or a +srv record) means the driver does replica
            // set / mongos discovery and may switch to internal hostnames that
            // aren't reachable from here.
            let multi_host = uri.contains("+srv") || host_part(uri).contains(',');
            if multi_host {
                "Could not reach the server in time. The hosts are unreachable, \
                 or the replica set is advertising internal hostnames this machine \
                 can't resolve. Check your network/VPN and DNS. To connect straight \
                 to one node, use a single host with ?directConnection=true."
                    .to_string()
            } else {
                "Could not reach the server in time. Check the host and port, and \
                 that the server is running and reachable from this machine \
                 (firewall / VPN)."
                    .to_string()
            }
        }
        ErrorKind::Authentication { message, .. } => {
            format!("Authentication failed: {message}")
        }
        ErrorKind::InvalidArgument { message, .. } => {
            format!("Invalid connection string: {message}")
        }
        _ => format!("could not reach server: {e}"),
    }
}

/// The `host:port,host:port` slice of a connection string, used to detect a
/// multi-host (replica set) URI. Returns "" if the URI has no host section.
fn host_part(uri: &str) -> &str {
    let after_scheme = uri.split("://").nth(1).unwrap_or("");
    // Strip credentials.
    let after_auth = after_scheme.rsplit('@').next().unwrap_or(after_scheme);
    // Stop at the path / query.
    after_auth
        .split(['/', '?'])
        .next()
        .unwrap_or(after_auth)
}

#[tauri::command]
pub fn list_connections(state: State<'_, Arc<AppState>>) -> Vec<Connection> {
    state.saved.lock().clone()
}

/// Which connection ids currently have an open client.
#[tauri::command]
pub fn active_connections(state: State<'_, Arc<AppState>>) -> Vec<String> {
    state.clients.lock().keys().cloned().collect()
}

#[tauri::command]
pub fn add_connection(
    state: State<'_, Arc<AppState>>,
    name: String,
    uri: String,
    color: String,
) -> Connection {
    let conn = Connection {
        id: uuid::Uuid::new_v4().to_string(),
        name,
        uri,
        color,
        created_at: now_ms(),
        last_connected: None,
        visible_dbs: Vec::new(),
    };
    state.saved.lock().push(conn.clone());
    state.persist_connections();
    conn
}

#[tauri::command]
pub fn update_connection(
    state: State<'_, Arc<AppState>>,
    id: String,
    name: String,
    uri: String,
    color: String,
) -> R<Connection> {
    let mut saved = state.saved.lock();
    let conn = saved
        .iter_mut()
        .find(|c| c.id == id)
        .ok_or("connection not found")?;
    conn.name = name;
    conn.uri = uri;
    conn.color = color;
    let out = conn.clone();
    drop(saved);
    state.persist_connections();
    Ok(out)
}

/// Choose which databases are shown in the sidebar (empty = all).
#[tauri::command]
pub fn set_visible_databases(state: State<'_, Arc<AppState>>, id: String, dbs: Vec<String>) {
    {
        let mut saved = state.saved.lock();
        if let Some(c) = saved.iter_mut().find(|c| c.id == id) {
            c.visible_dbs = dbs;
        }
    }
    state.persist_connections();
}

#[tauri::command]
pub fn remove_connection(state: State<'_, Arc<AppState>>, id: String) {
    state.saved.lock().retain(|c| c.id != id);
    state.clients.lock().remove(&id);
    state.persist_connections();
}

/// Test a raw connection string without persisting it. Returns the server version.
#[tauri::command]
pub async fn test_connection(uri: String) -> R<String> {
    let client = open_client(&uri).await?;
    let info = client
        .database("admin")
        .run_command(doc! { "buildInfo": 1 })
        .await
        .map_err(|e| e.to_string())?;
    Ok(info
        .get_str("version")
        .unwrap_or("unknown")
        .to_string())
}

/// Open a client for a saved connection and remember it as active.
#[tauri::command]
pub async fn connect(state: State<'_, Arc<AppState>>, id: String) -> R<()> {
    let uri = {
        let saved = state.saved.lock();
        saved
            .iter()
            .find(|c| c.id == id)
            .map(|c| c.uri.clone())
            .ok_or("connection not found")?
    };
    let client = open_client(&uri).await?;
    state.clients.lock().insert(id.clone(), client);
    {
        let mut saved = state.saved.lock();
        if let Some(c) = saved.iter_mut().find(|c| c.id == id) {
            c.last_connected = Some(now_ms());
        }
    }
    state.persist_connections();
    Ok(())
}

#[tauri::command]
pub fn disconnect(state: State<'_, Arc<AppState>>, id: String) {
    state.clients.lock().remove(&id);
}
