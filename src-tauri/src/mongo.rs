use crate::history;
use crate::state::AppState;
use bson::{doc, Bson, Document};
use futures::stream::TryStreamExt;
use mongodb::{Client, IndexModel};
use serde::Serialize;
use serde_json::Value;
use std::sync::Arc;
use std::time::Instant;
use tauri::State;

type R<T> = Result<T, String>;

// ── BSON <-> Extended JSON helpers ──────────────────────────────────────────

/// Parse a JSON string (MongoDB Extended JSON) into a Document. Empty → {}.
fn parse_doc(s: &str) -> R<Document> {
    let s = s.trim();
    if s.is_empty() {
        return Ok(Document::new());
    }
    let v: Value = serde_json::from_str(s).map_err(|e| format!("invalid JSON: {e}"))?;
    match Bson::try_from(v).map_err(|e| e.to_string())? {
        Bson::Document(d) => Ok(d),
        _ => Err("expected a JSON object".into()),
    }
}

/// Parse a JSON string into a bare BSON value (used for _id filters).
fn parse_bson(s: &str) -> R<Bson> {
    let v: Value = serde_json::from_str(s.trim()).map_err(|e| format!("invalid JSON: {e}"))?;
    Bson::try_from(v).map_err(|e| e.to_string())
}

/// Convert a Document to canonical Extended JSON so the frontend keeps full
/// BSON type fidelity ($oid, $date, $numberLong, $numberDecimal, …).
fn doc_to_value(d: Document) -> Value {
    Bson::Document(d).into_canonical_extjson()
}

fn num(d: &Document, k: &str) -> f64 {
    match d.get(k) {
        Some(Bson::Int32(n)) => *n as f64,
        Some(Bson::Int64(n)) => *n as f64,
        Some(Bson::Double(n)) => *n,
        _ => 0.0,
    }
}

fn coll_of(client: &Client, db: &str, coll: &str) -> mongodb::Collection<Document> {
    client.database(db).collection::<Document>(coll)
}

// ── DTOs ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseInfo {
    pub name: String,
    pub size_on_disk: f64,
    pub empty: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionInfo {
    pub name: String,
    pub r#type: String,
    pub count: f64,
    pub size: f64,
    pub storage_size: f64,
    pub avg_obj_size: f64,
    pub index_count: f64,
    pub index_size: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FindResult {
    pub docs: Vec<Value>,
    pub filtered_count: u64,
    pub total_count: u64,
    pub page: u32,
    pub page_size: u32,
    pub elapsed_ms: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexInfo {
    pub name: String,
    pub keys: Value,
    pub unique: bool,
    pub sparse: bool,
}

// ── Topology ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn list_databases(state: State<'_, Arc<AppState>>, conn_id: String) -> R<Vec<DatabaseInfo>> {
    let client = state.client(&conn_id)?;
    let specs = client.list_databases().await.map_err(|e| e.to_string())?;
    Ok(specs
        .into_iter()
        .map(|s| DatabaseInfo {
            name: s.name,
            size_on_disk: s.size_on_disk as f64,
            empty: s.empty,
        })
        .collect())
}

#[tauri::command]
pub async fn list_collections(
    state: State<'_, Arc<AppState>>,
    conn_id: String,
    db: String,
) -> R<Vec<CollectionInfo>> {
    let client = state.client(&conn_id)?;
    let database = client.database(&db);

    let specs = database
        .list_collections()
        .await
        .map_err(|e| e.to_string())?
        .try_collect::<Vec<_>>()
        .await
        .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    for spec in specs {
        let name = spec.name.clone();
        let ctype = format!("{:?}", spec.collection_type).to_lowercase();
        let mut info = CollectionInfo {
            name: name.clone(),
            r#type: ctype,
            count: 0.0,
            size: 0.0,
            storage_size: 0.0,
            avg_obj_size: 0.0,
            index_count: 0.0,
            index_size: 0.0,
        };
        // Best-effort stats via $collStats (modern, replaces collStats command).
        if let Ok(mut cur) = database
            .collection::<Document>(&name)
            .aggregate(vec![doc! { "$collStats": { "storageStats": {} } }])
            .await
        {
            if let Ok(Some(res)) = cur.try_next().await {
                if let Ok(storage) = res.get_document("storageStats") {
                    info.count = num(storage, "count");
                    info.size = num(storage, "size");
                    info.storage_size = num(storage, "storageSize");
                    info.avg_obj_size = num(storage, "avgObjSize");
                    info.index_count = num(storage, "nindexes");
                    info.index_size = num(storage, "totalIndexSize");
                }
            }
        }
        out.push(info);
    }
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(out)
}

// ── Read documents ─────────────────────────────────────────────────────────────

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn find_documents(
    state: State<'_, Arc<AppState>>,
    conn_id: String,
    db: String,
    coll: String,
    filter: String,
    sort: String,
    projection: String,
    page: u32,
    page_size: u32,
    skip: u64,
) -> R<FindResult> {
    let client = state.client(&conn_id)?;
    let c = coll_of(&client, &db, &coll);

    let filter_doc = parse_doc(&filter)?;
    let sort_doc = parse_doc(&sort)?;
    let proj_doc = parse_doc(&projection)?;
    let page = page.max(1);
    let skip = skip + ((page - 1) as u64) * page_size as u64;

    let started = Instant::now();

    let mut find = c.find(filter_doc.clone()).skip(skip).limit(page_size as i64);
    if !sort_doc.is_empty() {
        find = find.sort(sort_doc);
    }
    if !proj_doc.is_empty() {
        find = find.projection(proj_doc);
    }
    let cursor = find.await.map_err(|e| e.to_string())?;
    let docs: Vec<Document> = cursor.try_collect().await.map_err(|e| e.to_string())?;

    let filtered_count = c
        .count_documents(filter_doc)
        .await
        .map_err(|e| e.to_string())?;
    let total_count = c
        .estimated_document_count()
        .await
        .unwrap_or(filtered_count);

    Ok(FindResult {
        docs: docs.into_iter().map(doc_to_value).collect(),
        filtered_count,
        total_count,
        page,
        page_size,
        elapsed_ms: started.elapsed().as_millis() as u64,
    })
}

#[tauri::command]
pub async fn aggregate(
    state: State<'_, Arc<AppState>>,
    conn_id: String,
    db: String,
    coll: String,
    pipeline: String,
    limit: u32,
) -> R<Vec<Value>> {
    let client = state.client(&conn_id)?;
    let c = coll_of(&client, &db, &coll);
    let v: Value = serde_json::from_str(pipeline.trim()).map_err(|e| format!("invalid pipeline: {e}"))?;
    let arr = match Bson::try_from(v).map_err(|e| e.to_string())? {
        Bson::Array(a) => a,
        _ => return Err("pipeline must be a JSON array".into()),
    };
    let stages: Vec<Document> = arr
        .into_iter()
        .filter_map(|b| match b {
            Bson::Document(d) => Some(d),
            _ => None,
        })
        .collect();
    let cursor = c.aggregate(stages).await.map_err(|e| e.to_string())?;
    let docs: Vec<Document> = cursor.try_collect().await.map_err(|e| e.to_string())?;
    Ok(docs
        .into_iter()
        .take(limit as usize)
        .map(doc_to_value)
        .collect())
}

// ── Write documents (history-backed) ────────────────────────────────────────

#[tauri::command]
pub async fn insert_document(
    state: State<'_, Arc<AppState>>,
    conn_id: String,
    db: String,
    coll: String,
    doc_json: String,
) -> R<Value> {
    let client = state.client(&conn_id)?;
    let c = coll_of(&client, &db, &coll);
    let document = parse_doc(&doc_json)?;
    let res = c.insert_one(document.clone()).await.map_err(|e| e.to_string())?;
    let mut stored = document;
    stored.insert("_id", res.inserted_id.clone());
    Ok(doc_to_value(stored))
}

#[tauri::command]
pub async fn update_document(
    state: State<'_, Arc<AppState>>,
    conn_id: String,
    db: String,
    coll: String,
    doc_json: String,
) -> R<()> {
    let client = state.client(&conn_id)?;
    let c = coll_of(&client, &db, &coll);
    let document = parse_doc(&doc_json)?;
    let id = document.get("_id").cloned().ok_or("document has no _id")?;
    let filter = doc! { "_id": id };

    let before = c.find_one(filter.clone()).await.map_err(|e| e.to_string())?;
    let before_json = before.map(|b| serde_json::to_string(&doc_to_value(b)).unwrap_or_default());
    let after_json = serde_json::to_string(&doc_to_value(document.clone())).ok();

    c.replace_one(filter, document).await.map_err(|e| e.to_string())?;
    if state.settings.lock().record_updates {
        history::record(state.inner(), &conn_id, &db, &coll, "replace", before_json, after_json);
    }
    Ok(())
}

#[tauri::command]
pub async fn delete_document(
    state: State<'_, Arc<AppState>>,
    conn_id: String,
    db: String,
    coll: String,
    id_json: String,
) -> R<()> {
    let client = state.client(&conn_id)?;
    let c = coll_of(&client, &db, &coll);
    let id = parse_bson(&id_json)?;
    let filter = doc! { "_id": id };

    let before = c.find_one(filter.clone()).await.map_err(|e| e.to_string())?;
    let before_json = before.map(|b| serde_json::to_string(&doc_to_value(b)).unwrap_or_default());

    c.delete_one(filter).await.map_err(|e| e.to_string())?;
    if state.settings.lock().record_deletes {
        history::record(state.inner(), &conn_id, &db, &coll, "delete", before_json, None);
    }
    Ok(())
}

#[tauri::command]
pub async fn delete_many(
    state: State<'_, Arc<AppState>>,
    conn_id: String,
    db: String,
    coll: String,
    filter: String,
) -> R<u64> {
    let client = state.client(&conn_id)?;
    let c = coll_of(&client, &db, &coll);
    let filter_doc = parse_doc(&filter)?;

    // Back up up to 1000 matched documents before deleting.
    let cursor = c.find(filter_doc.clone()).limit(1000).await.map_err(|e| e.to_string())?;
    let matched: Vec<Document> = cursor.try_collect().await.map_err(|e| e.to_string())?;
    let backup: Vec<Value> = matched.into_iter().map(doc_to_value).collect();
    let before_json = serde_json::to_string(&backup).ok();

    let res = c.delete_many(filter_doc).await.map_err(|e| e.to_string())?;
    if state.settings.lock().record_deletes {
        history::record(state.inner(), &conn_id, &db, &coll, "deleteMany", before_json, None);
    }
    Ok(res.deleted_count)
}

// ── Collection management ────────────────────────────────────────────────────

#[tauri::command]
pub async fn create_collection(
    state: State<'_, Arc<AppState>>,
    conn_id: String,
    db: String,
    name: String,
) -> R<()> {
    let client = state.client(&conn_id)?;
    client.database(&db).create_collection(&name).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn drop_collection(
    state: State<'_, Arc<AppState>>,
    conn_id: String,
    db: String,
    coll: String,
) -> R<()> {
    let client = state.client(&conn_id)?;
    coll_of(&client, &db, &coll).drop().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn rename_collection(
    state: State<'_, Arc<AppState>>,
    conn_id: String,
    db: String,
    coll: String,
    new_name: String,
) -> R<()> {
    let client = state.client(&conn_id)?;
    client
        .database("admin")
        .run_command(doc! {
            "renameCollection": format!("{db}.{coll}"),
            "to": format!("{db}.{new_name}"),
            "dropTarget": false,
        })
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Duplicate a collection's documents into a new name in the same database.
#[tauri::command]
pub async fn duplicate_collection(
    state: State<'_, Arc<AppState>>,
    conn_id: String,
    db: String,
    coll: String,
    new_name: String,
) -> R<()> {
    let client = state.client(&conn_id)?;
    let c = coll_of(&client, &db, &coll);
    c.aggregate(vec![doc! { "$match": {} }, doc! { "$out": new_name }])
        .await
        .map_err(|e| e.to_string())?
        .try_collect::<Vec<Document>>()
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn drop_database(state: State<'_, Arc<AppState>>, conn_id: String, db: String) -> R<()> {
    let client = state.client(&conn_id)?;
    client.database(&db).drop().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_database(
    state: State<'_, Arc<AppState>>,
    conn_id: String,
    db: String,
    first_collection: String,
) -> R<()> {
    let client = state.client(&conn_id)?;
    client
        .database(&db)
        .create_collection(&first_collection)
        .await
        .map_err(|e| e.to_string())
}

// ── Indexes ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn list_indexes(
    state: State<'_, Arc<AppState>>,
    conn_id: String,
    db: String,
    coll: String,
) -> R<Vec<IndexInfo>> {
    let client = state.client(&conn_id)?;
    let c = coll_of(&client, &db, &coll);
    let models: Vec<IndexModel> = c
        .list_indexes()
        .await
        .map_err(|e| e.to_string())?
        .try_collect()
        .await
        .map_err(|e| e.to_string())?;
    Ok(models
        .into_iter()
        .map(|m| {
            let name = m
                .options
                .as_ref()
                .and_then(|o| o.name.clone())
                .unwrap_or_else(|| "index".into());
            let unique = m.options.as_ref().and_then(|o| o.unique).unwrap_or(false);
            let sparse = m.options.as_ref().and_then(|o| o.sparse).unwrap_or(false);
            IndexInfo {
                name,
                keys: doc_to_value(m.keys),
                unique,
                sparse,
            }
        })
        .collect())
}

#[tauri::command]
pub async fn create_index(
    state: State<'_, Arc<AppState>>,
    conn_id: String,
    db: String,
    coll: String,
    keys: String,
    unique: bool,
) -> R<()> {
    let client = state.client(&conn_id)?;
    let c = coll_of(&client, &db, &coll);
    let keys_doc = parse_doc(&keys)?;
    let options = mongodb::options::IndexOptions::builder()
        .unique(unique)
        .build();
    let model = IndexModel::builder().keys(keys_doc).options(options).build();
    c.create_index(model).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn drop_index(
    state: State<'_, Arc<AppState>>,
    conn_id: String,
    db: String,
    coll: String,
    name: String,
) -> R<()> {
    let client = state.client(&conn_id)?;
    coll_of(&client, &db, &coll).drop_index(name).await.map_err(|e| e.to_string())
}
