use crate::state::{now_ms, AppState};
use bson::{doc, Bson, Document};
use rusqlite::{params, Connection as SqlConn};
use serde::Serialize;
use serde_json::Value;
use std::path::Path;
use std::sync::Arc;

pub fn open(path: &Path) -> Result<SqlConn, Box<dyn std::error::Error>> {
    let conn = SqlConn::open(path)?;
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS history (
            id          TEXT PRIMARY KEY,
            conn_id     TEXT NOT NULL,
            db          TEXT NOT NULL,
            coll        TEXT NOT NULL,
            op          TEXT NOT NULL,
            before_json TEXT,
            after_json  TEXT,
            ts          INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_history_coll
            ON history(conn_id, db, coll, ts DESC);
        "#,
    )?;
    Ok(conn)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub id: String,
    pub conn_id: String,
    pub db: String,
    pub coll: String,
    pub op: String,
    pub before_json: Option<String>,
    pub after_json: Option<String>,
    pub ts: i64,
}

/// Record a backup entry capturing the before/after state of a mutation.
pub fn record(
    state: &Arc<AppState>,
    conn_id: &str,
    db: &str,
    coll: &str,
    op: &str,
    before_json: Option<String>,
    after_json: Option<String>,
) {
    let id = uuid::Uuid::new_v4().to_string();
    let conn = state.history.lock();
    let _ = conn.execute(
        "INSERT INTO history(id, conn_id, db, coll, op, before_json, after_json, ts)
         VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![id, conn_id, db, coll, op, before_json, after_json, now_ms()],
    );
}

pub fn list(
    state: &Arc<AppState>,
    conn_id: &str,
    db: &str,
    coll: &str,
    limit: u32,
) -> Result<Vec<HistoryEntry>, String> {
    let conn = state.history.lock();
    let mut stmt = conn
        .prepare(
            "SELECT id, conn_id, db, coll, op, before_json, after_json, ts
             FROM history WHERE conn_id=?1 AND db=?2 AND coll=?3
             ORDER BY ts DESC LIMIT ?4",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![conn_id, db, coll, limit], |r| {
            Ok(HistoryEntry {
                id: r.get(0)?,
                conn_id: r.get(1)?,
                db: r.get(2)?,
                coll: r.get(3)?,
                op: r.get(4)?,
                before_json: r.get(5)?,
                after_json: r.get(6)?,
                ts: r.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

// ── Tauri commands ──────────────────────────────────────────────────────────

#[tauri::command]
pub fn list_history(
    state: tauri::State<'_, Arc<AppState>>,
    conn_id: String,
    db: String,
    coll: String,
    limit: u32,
) -> Result<Vec<HistoryEntry>, String> {
    list(state.inner(), &conn_id, &db, &coll, limit)
}

#[tauri::command]
pub fn get_history_entry(
    state: tauri::State<'_, Arc<AppState>>,
    id: String,
) -> Result<Option<HistoryEntry>, String> {
    get(state.inner(), &id)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CollCount {
    pub coll: String,
    pub count: i64,
}

/// Collections (in a database) that have backup history, with their entry count.
#[tauri::command]
pub fn history_collections(
    state: tauri::State<'_, Arc<AppState>>,
    conn_id: String,
    db: String,
) -> Result<Vec<CollCount>, String> {
    let conn = state.history.lock();
    let mut stmt = conn
        .prepare("SELECT coll, COUNT(*) FROM history WHERE conn_id=?1 AND db=?2 GROUP BY coll")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![conn_id, db], |r| {
            Ok(CollCount { coll: r.get(0)?, count: r.get(1)? })
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

/// Remove a single backup entry.
#[tauri::command]
pub fn delete_history_entry(state: tauri::State<'_, Arc<AppState>>, id: String) -> Result<(), String> {
    state
        .history
        .lock()
        .execute("DELETE FROM history WHERE id=?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Empty all backup history for a collection.
#[tauri::command]
pub fn clear_history(
    state: tauri::State<'_, Arc<AppState>>,
    conn_id: String,
    db: String,
    coll: String,
) -> Result<(), String> {
    state
        .history
        .lock()
        .execute(
            "DELETE FROM history WHERE conn_id=?1 AND db=?2 AND coll=?3",
            params![conn_id, db, coll],
        )
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn parse_doc(s: &str) -> Result<Document, String> {
    let v: Value = serde_json::from_str(s).map_err(|e| e.to_string())?;
    match Bson::try_from(v).map_err(|e| e.to_string())? {
        Bson::Document(d) => Ok(d),
        _ => Err("expected a document".into()),
    }
}

fn parse_array(s: &str) -> Result<Vec<Document>, String> {
    let v: Value = serde_json::from_str(s).map_err(|e| e.to_string())?;
    match Bson::try_from(v).map_err(|e| e.to_string())? {
        Bson::Array(a) => Ok(a
            .into_iter()
            .filter_map(|b| match b {
                Bson::Document(d) => Some(d),
                _ => None,
            })
            .collect()),
        Bson::Document(d) => Ok(vec![d]),
        _ => Ok(vec![]),
    }
}

/// Re-apply the "before" state of a backup entry (undo the recorded mutation).
#[tauri::command]
pub async fn restore_history_entry(
    state: tauri::State<'_, Arc<AppState>>,
    id: String,
) -> Result<(), String> {
    let entry = get(state.inner(), &id)?.ok_or("backup entry not found")?;
    let client = state.client(&entry.conn_id)?;
    let coll = client
        .database(&entry.db)
        .collection::<Document>(&entry.coll);

    match entry.op.as_str() {
        "delete" => {
            if let Some(b) = &entry.before_json {
                coll.insert_one(parse_doc(b)?).await.map_err(|e| e.to_string())?;
            }
        }
        "deleteMany" => {
            if let Some(b) = &entry.before_json {
                let docs = parse_array(b)?;
                if !docs.is_empty() {
                    coll.insert_many(docs).await.map_err(|e| e.to_string())?;
                }
            }
        }
        "replace" | "update" => {
            if let Some(b) = &entry.before_json {
                let d = parse_doc(b)?;
                let oid = d.get("_id").cloned().ok_or("backup has no _id")?;
                coll.replace_one(doc! { "_id": oid }, d)
                    .upsert(true)
                    .await
                    .map_err(|e| e.to_string())?;
            }
        }
        "insert" => {
            if let Some(a) = &entry.after_json {
                let d = parse_doc(a)?;
                if let Some(oid) = d.get("_id").cloned() {
                    coll.delete_one(doc! { "_id": oid }).await.map_err(|e| e.to_string())?;
                }
            }
        }
        other => return Err(format!("cannot restore op: {other}")),
    }

    record(
        state.inner(),
        &entry.conn_id,
        &entry.db,
        &entry.coll,
        "restore",
        None,
        entry.before_json.clone().or(entry.after_json.clone()),
    );
    Ok(())
}

pub fn get(state: &Arc<AppState>, id: &str) -> Result<Option<HistoryEntry>, String> {
    let conn = state.history.lock();
    let mut stmt = conn
        .prepare(
            "SELECT id, conn_id, db, coll, op, before_json, after_json, ts
             FROM history WHERE id=?1",
        )
        .map_err(|e| e.to_string())?;
    let mut rows = stmt
        .query_map(params![id], |r| {
            Ok(HistoryEntry {
                id: r.get(0)?,
                conn_id: r.get(1)?,
                db: r.get(2)?,
                coll: r.get(3)?,
                op: r.get(4)?,
                before_json: r.get(5)?,
                after_json: r.get(6)?,
                ts: r.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?;
    match rows.next() {
        Some(r) => Ok(Some(r.map_err(|e| e.to_string())?)),
        None => Ok(None),
    }
}
