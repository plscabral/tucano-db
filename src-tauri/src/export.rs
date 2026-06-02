use crate::state::AppState;
use bson::{Bson, Document};
use futures::stream::TryStreamExt;
use std::sync::Arc;
use tauri::State;

type R<T> = Result<T, String>;

fn parse_doc(s: &str) -> R<Document> {
    let s = s.trim();
    if s.is_empty() {
        return Ok(Document::new());
    }
    let v: serde_json::Value = serde_json::from_str(s).map_err(|e| format!("invalid JSON: {e}"))?;
    match Bson::try_from(v).map_err(|e| e.to_string())? {
        Bson::Document(d) => Ok(d),
        _ => Err("expected a JSON object".into()),
    }
}

/// Flatten a BSON value to a single cell string for tabular exports.
fn cell(b: &Bson) -> String {
    match b {
        Bson::String(s) => s.clone(),
        Bson::Int32(n) => n.to_string(),
        Bson::Int64(n) => n.to_string(),
        Bson::Double(n) => n.to_string(),
        Bson::Boolean(x) => x.to_string(),
        Bson::ObjectId(o) => o.to_hex(),
        Bson::DateTime(d) => d.try_to_rfc3339_string().unwrap_or_default(),
        Bson::Null => String::new(),
        other => other.clone().into_relaxed_extjson().to_string(),
    }
}

/// Export documents matching the current query to a file (csv | xlsx | json).
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn export_documents(
    state: State<'_, Arc<AppState>>,
    conn_id: String,
    db: String,
    coll: String,
    filter: String,
    sort: String,
    limit: u32,
    format: String,
    path: String,
) -> R<u64> {
    let client = state.client(&conn_id)?;
    let c = client.database(&db).collection::<Document>(&coll);
    let filter_doc = parse_doc(&filter)?;
    let sort_doc = parse_doc(&sort)?;

    let mut find = c.find(filter_doc).limit(limit.max(1) as i64);
    if !sort_doc.is_empty() {
        find = find.sort(sort_doc);
    }
    let cursor = find.await.map_err(|e| e.to_string())?;
    let docs: Vec<Document> = cursor.try_collect().await.map_err(|e| e.to_string())?;
    let count = docs.len() as u64;

    match format.as_str() {
        "json" => {
            let values: Vec<serde_json::Value> = docs
                .into_iter()
                .map(|d| Bson::Document(d).into_canonical_extjson())
                .collect();
            let text = serde_json::to_string_pretty(&values).map_err(|e| e.to_string())?;
            std::fs::write(&path, text).map_err(|e| e.to_string())?;
        }
        "csv" => {
            let columns = collect_columns(&docs);
            let mut wtr = csv::Writer::from_path(&path).map_err(|e| e.to_string())?;
            wtr.write_record(&columns).map_err(|e| e.to_string())?;
            for d in &docs {
                let row: Vec<String> = columns
                    .iter()
                    .map(|col| d.get(col).map(cell).unwrap_or_default())
                    .collect();
                wtr.write_record(&row).map_err(|e| e.to_string())?;
            }
            wtr.flush().map_err(|e| e.to_string())?;
        }
        "xlsx" => {
            let columns = collect_columns(&docs);
            let mut workbook = rust_xlsxwriter::Workbook::new();
            let sheet = workbook.add_worksheet();
            for (ci, col) in columns.iter().enumerate() {
                sheet
                    .write_string(0, ci as u16, col)
                    .map_err(|e| e.to_string())?;
            }
            for (ri, d) in docs.iter().enumerate() {
                for (ci, col) in columns.iter().enumerate() {
                    let v = d.get(col).map(cell).unwrap_or_default();
                    sheet
                        .write_string((ri + 1) as u32, ci as u16, &v)
                        .map_err(|e| e.to_string())?;
                }
            }
            workbook.save(&path).map_err(|e| e.to_string())?;
        }
        other => return Err(format!("unsupported export format: {other}")),
    }

    Ok(count)
}

/// Ordered union of top-level keys across all documents (first-seen order).
fn collect_columns(docs: &[Document]) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    let mut cols = Vec::new();
    for d in docs {
        for (k, _) in d {
            if seen.insert(k.clone()) {
                cols.push(k.clone());
            }
        }
    }
    cols
}
