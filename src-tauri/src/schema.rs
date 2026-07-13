use crate::state::AppState;
use bson::{Bson, Document};
use futures::stream::TryStreamExt;
use mongodb::Collection;
use serde::Serialize;
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};
use std::sync::Arc;
use tauri::State;

type R<T> = Result<T, String>;

const MAX_SAMPLE_VALUES: usize = 3;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FieldSchema {
    pub path: String,
    pub types: Vec<String>,
    /// Number of sampled documents in which this path was observed.
    pub present: u32,
    /// A small, type-faithful preview of observed values.
    pub sample_values: Vec<Value>,
    /// Indexes that can serve this field (including a matching compound prefix).
    pub index_names: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemaIndex {
    pub name: String,
    pub keys: Value,
    pub unique: bool,
    pub sparse: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemaAnalysis {
    pub sampled_documents: u32,
    pub fields: Vec<FieldSchema>,
    pub indexes: Vec<SchemaIndex>,
}

#[derive(Default)]
struct FieldAcc {
    types: BTreeSet<String>,
    sample_values: Vec<Value>,
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

fn observe(acc: &mut FieldAcc, value: &Bson) {
    acc.types.insert(bson_type_name(value).to_string());
    let preview = safe_preview(value);
    if acc.sample_values.len() < MAX_SAMPLE_VALUES && !acc.sample_values.contains(&preview) {
        acc.sample_values.push(preview);
    }
}

/// Schema inspection must not turn into a data-exfiltration surface. Keep
/// representative *shapes* useful for diagnosis while never returning sampled
/// field values such as names, identifiers, dates or credentials.
fn safe_preview(value: &Bson) -> Value {
    let description = match value {
        Bson::String(text) => format!("string · {} chars", text.chars().count()),
        Bson::Document(document) => format!("object · {} fields", document.len()),
        Bson::Array(items) => format!("array · {} items", items.len()),
        Bson::Binary(binary) => format!("binary · {} bytes", binary.bytes.len()),
        Bson::Null => "null".into(),
        Bson::Boolean(_) => "boolean".into(),
        Bson::Double(_) => "double value".into(),
        Bson::Int32(_) => "integer value".into(),
        Bson::Int64(_) => "long value".into(),
        Bson::Decimal128(_) => "decimal value".into(),
        Bson::ObjectId(_) => "objectId".into(),
        Bson::DateTime(_) => "date".into(),
        Bson::Timestamp(_) => "timestamp".into(),
        Bson::RegularExpression(_) => "regex".into(),
        Bson::JavaScriptCode(_) | Bson::JavaScriptCodeWithScope(_) => "javascript".into(),
        Bson::Symbol(_) => "symbol".into(),
        Bson::MaxKey => "maxKey".into(),
        Bson::MinKey => "minKey".into(),
        Bson::Undefined => "undefined".into(),
        Bson::DbPointer(_) => "dbPointer".into(),
    };
    Value::String(description)
}

/// Build one document's field map first. This lets `present` count documents
/// rather than array members when a nested field appears multiple times.
fn walk(doc: &Document, prefix: &str, acc: &mut BTreeMap<String, FieldAcc>) {
    for (key, value) in doc {
        let path = if prefix.is_empty() {
            key.clone()
        } else {
            format!("{prefix}.{key}")
        };
        observe(acc.entry(path.clone()).or_default(), value);
        match value {
            Bson::Document(sub) => walk(sub, &path, acc),
            Bson::Array(items) => {
                for item in items {
                    if let Bson::Document(sub) = item {
                        walk(sub, &path, acc);
                    }
                }
            }
            _ => {}
        }
    }
}

async fn infer_fields(collection: &Collection<Document>, sample: u32) -> R<(u32, Vec<FieldSchema>)> {
    let cursor = collection
        .find(Document::new())
        .limit(sample.clamp(1, 500) as i64)
        .await
        .map_err(|e| e.to_string())?;
    let docs: Vec<Document> = cursor.try_collect().await.map_err(|e| e.to_string())?;
    let sampled_documents = docs.len() as u32;
    let mut fields: BTreeMap<String, (u32, FieldAcc)> = BTreeMap::new();

    for doc in &docs {
        let mut document_fields = BTreeMap::new();
        walk(doc, "", &mut document_fields);
        for (path, observed) in document_fields {
            let (present, accumulated) = fields.entry(path).or_default();
            *present += 1;
            accumulated.types.extend(observed.types);
            for value in observed.sample_values {
                if accumulated.sample_values.len() < MAX_SAMPLE_VALUES
                    && !accumulated.sample_values.contains(&value)
                {
                    accumulated.sample_values.push(value);
                }
            }
        }
    }

    Ok((
        sampled_documents,
        fields
            .into_iter()
            .map(|(path, (present, observed))| FieldSchema {
                path,
                types: observed.types.into_iter().collect(),
                present,
                sample_values: observed.sample_values,
                index_names: Vec::new(),
            })
            .collect(),
    ))
}

fn index_field_names(index: &SchemaIndex) -> Vec<String> {
    index
        .keys
        .as_object()
        .map(|keys| keys.keys().cloned().collect())
        .unwrap_or_default()
}

fn index_covers_path(index: &SchemaIndex, path: &str) -> bool {
    index_field_names(index)
        .first()
        .is_some_and(|key| path == key || path.starts_with(&format!("{key}.")))
}

/// Sample documents and infer their field paths/types. Used by query autocomplete.
#[tauri::command]
pub async fn sample_fields(
    state: State<'_, Arc<AppState>>,
    conn_id: String,
    db: String,
    coll: String,
    sample: u32,
) -> R<Vec<FieldSchema>> {
    let client = state.client(&conn_id)?;
    let collection = client.database(&db).collection::<Document>(&coll);
    let (_, fields) = infer_fields(&collection, sample).await?;
    Ok(fields)
}

/// Analyze a collection without changing it. Shared by the Tauri command and
/// the localhost MCP bridge so both surfaces return the same report.
pub async fn analyze_collection(collection: &Collection<Document>, sample: u32) -> R<SchemaAnalysis> {
    let (sampled_documents, mut fields) = infer_fields(collection, sample).await?;
    let indexes = collection
        .list_indexes()
        .await
        .map_err(|e| e.to_string())?
        .try_collect::<Vec<_>>()
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .map(|model| SchemaIndex {
            name: model
                .options
                .as_ref()
                .and_then(|options| options.name.clone())
                .unwrap_or_else(|| "index".into()),
            keys: Bson::Document(model.keys).into_canonical_extjson(),
            unique: model
                .options
                .as_ref()
                .and_then(|options| options.unique)
                .unwrap_or(false),
            sparse: model
                .options
                .as_ref()
                .and_then(|options| options.sparse)
                .unwrap_or(false),
        })
        .collect::<Vec<_>>();

    for field in &mut fields {
        field.index_names = indexes
            .iter()
            .filter(|index| index_covers_path(index, &field.path))
            .map(|index| index.name.clone())
            .collect();
    }

    Ok(SchemaAnalysis {
        sampled_documents,
        fields,
        indexes,
    })
}

/// A read-only schema report suitable for the desktop UI and MCP clients.
#[tauri::command]
pub async fn analyze_schema(
    state: State<'_, Arc<AppState>>,
    conn_id: String,
    db: String,
    coll: String,
    sample: u32,
) -> R<SchemaAnalysis> {
    let client = state.client(&conn_id)?;
    let collection = client.database(&db).collection::<Document>(&coll);
    analyze_collection(&collection, sample).await
}
