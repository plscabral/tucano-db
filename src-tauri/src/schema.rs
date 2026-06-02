use crate::state::AppState;
use bson::{Bson, Document};
use futures::stream::TryStreamExt;
use serde::Serialize;
use std::collections::{BTreeMap, BTreeSet};
use std::sync::Arc;
use tauri::State;

type R<T> = Result<T, String>;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FieldSchema {
    pub path: String,
    pub types: Vec<String>,
}

pub fn bson_type_name(b: &Bson) -> &'static str {
    match b {
        Bson::Double(_) => "double",
        Bson::String(_) => "string",
        Bson::Document(_) => "object",
        Bson::Array(_) => "array",
        Bson::Boolean(_) => "bool",
        Bson::Null => "null",
        Bson::RegularExpression(_) => "regex",
        Bson::Int32(_) => "int",
        Bson::Int64(_) => "long",
        Bson::Timestamp(_) => "timestamp",
        Bson::Binary(_) => "binary",
        Bson::ObjectId(_) => "objectId",
        Bson::DateTime(_) => "date",
        Bson::Decimal128(_) => "decimal",
        Bson::JavaScriptCode(_) => "javascript",
        Bson::JavaScriptCodeWithScope(_) => "javascript",
        Bson::Symbol(_) => "symbol",
        Bson::MaxKey => "maxKey",
        Bson::MinKey => "minKey",
        Bson::Undefined => "undefined",
        Bson::DbPointer(_) => "dbPointer",
    }
}

fn walk(doc: &Document, prefix: &str, acc: &mut BTreeMap<String, BTreeSet<String>>) {
    for (k, v) in doc {
        let path = if prefix.is_empty() {
            k.clone()
        } else {
            format!("{prefix}.{k}")
        };
        acc.entry(path.clone())
            .or_default()
            .insert(bson_type_name(v).to_string());
        match v {
            Bson::Document(sub) => walk(sub, &path, acc),
            Bson::Array(arr) => {
                if let Some(Bson::Document(sub)) = arr.first() {
                    walk(sub, &path, acc);
                }
            }
            _ => {}
        }
    }
}

/// Sample documents from a collection and infer field paths + observed types,
/// feeding the filter autocomplete.
#[tauri::command]
pub async fn sample_fields(
    state: State<'_, Arc<AppState>>,
    conn_id: String,
    db: String,
    coll: String,
    sample: u32,
) -> R<Vec<FieldSchema>> {
    let client = state.client(&conn_id)?;
    let c = client.database(&db).collection::<Document>(&coll);
    let cursor = c
        .find(Document::new())
        .limit(sample.max(1) as i64)
        .await
        .map_err(|e| e.to_string())?;
    let docs: Vec<Document> = cursor.try_collect().await.map_err(|e| e.to_string())?;

    let mut acc: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    for d in &docs {
        walk(d, "", &mut acc);
    }
    Ok(acc
        .into_iter()
        .map(|(path, types)| FieldSchema {
            path,
            types: types.into_iter().collect(),
        })
        .collect())
}
