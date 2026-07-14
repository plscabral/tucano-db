use crate::state::AppState;
use bson::{doc, Bson, Document};
use serde::Serialize;
use std::collections::BTreeMap;
use std::sync::Arc;
use tauri::State;

type R<T> = Result<T, String>;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseInfo {
    pub name: String,
    pub size_on_disk: f64,
    pub empty: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerOverview {
    pub server_status_available: bool,
    pub version: String,
    pub host: String,
    pub uptime_seconds: f64,
    pub connections_current: f64,
    pub connections_available: f64,
    pub opcounters: BTreeMap<String, f64>,
    pub mem_resident_mb: f64,
    pub mem_virtual_mb: f64,
    pub network_bytes_in: f64,
    pub network_bytes_out: f64,
    pub databases: Vec<DatabaseInfo>,
    pub total_data_size: f64,
    pub total_storage_size: f64,
    pub total_collections: u64,
}

fn num(d: &Document, k: &str) -> f64 {
    match d.get(k) {
        Some(Bson::Int32(n)) => *n as f64,
        Some(Bson::Int64(n)) => *n as f64,
        Some(Bson::Double(n)) => *n,
        _ => 0.0,
    }
}

fn num_path(d: &Document, a: &str, b: &str) -> f64 {
    d.get_document(a).ok().map(|sub| num(sub, b)).unwrap_or(0.0)
}

#[tauri::command]
pub async fn server_overview(state: State<'_, Arc<AppState>>, conn_id: String) -> R<ServerOverview> {
    let client = state.client_or_connect(&conn_id).await?;
    let admin = client.database("admin");

    // `serverStatus` requires cluster-monitor privileges, which many valid
    // read-only accounts do not have. Overview remains useful with the data
    // permissions that are available instead of surfacing Mongo's raw error.
    let status = admin.run_command(doc! { "serverStatus": 1 }).await.ok();
    let empty_status = Document::new();
    let status_doc = status.as_ref().unwrap_or(&empty_status);

    let version = status_doc.get_str("version").unwrap_or("restricted").to_string();
    let host = status_doc.get_str("host").unwrap_or("restricted access").to_string();
    let uptime_seconds = num(status_doc, "uptime");

    let connections_current = num_path(status_doc, "connections", "current");
    let connections_available = num_path(status_doc, "connections", "available");

    let mut opcounters = BTreeMap::new();
    if let Ok(oc) = status_doc.get_document("opcounters") {
        for (k, _) in oc {
            opcounters.insert(k.clone(), num(oc, k));
        }
    }

    let mem_resident_mb = num_path(status_doc, "mem", "resident");
    let mem_virtual_mb = num_path(status_doc, "mem", "virtual");
    let network_bytes_in = num_path(status_doc, "network", "bytesIn");
    let network_bytes_out = num_path(status_doc, "network", "bytesOut");

    // Per-database sizes.
    let specs = client.list_databases().await.map_err(|e| e.to_string())?;
    let databases: Vec<DatabaseInfo> = specs
        .into_iter()
        .map(|s| DatabaseInfo {
            name: s.name,
            size_on_disk: s.size_on_disk as f64,
            empty: s.empty,
        })
        .collect();

    // Aggregate data/storage size + collection count across user databases.
    let mut total_data_size = 0.0;
    let mut total_storage_size = 0.0;
    let mut total_collections = 0u64;
    for d in &databases {
        if let Ok(stats) = client
            .database(&d.name)
            .run_command(doc! { "dbStats": 1 })
            .await
        {
            total_data_size += num(&stats, "dataSize");
            total_storage_size += num(&stats, "storageSize");
            total_collections += num(&stats, "collections") as u64;
        }
    }

    Ok(ServerOverview {
        server_status_available: status.is_some(),
        version,
        host,
        uptime_seconds,
        connections_current,
        connections_available,
        opcounters,
        mem_resident_mb,
        mem_virtual_mb,
        network_bytes_in,
        network_bytes_out,
        databases,
        total_data_size,
        total_storage_size,
        total_collections,
    })
}
