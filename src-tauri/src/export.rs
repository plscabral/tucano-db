use crate::state::AppState;
use bson::{Bson, Document};
use futures::stream::TryStreamExt;
use rust_xlsxwriter::{Color, Format, FormatAlign, FormatBorder, Workbook};
use std::sync::Arc;
use tauri::State;

type R<T> = Result<T, String>;

// Tucano DB palette (mirrors CONN_COLOR_HEX.teal / tucano accents in the UI).
const TUCANO_TEAL: u32 = 0x1A96AD;
const TUCANO_TEAL_DARK: u32 = 0x127A8D;
const BAND_FILL: u32 = 0xEAF5F7; // soft teal tint for zebra striping
const GRID_LINE: u32 = 0x9CB8BF; // muted teal-gray, visible over white + bands

/// A worksheet name Excel accepts: ≤31 chars, none of `[]:*?/\`.
fn sheet_name(coll: &str) -> String {
    let cleaned: String = coll
        .chars()
        .map(|c| if "[]:*?/\\".contains(c) { '_' } else { c })
        .take(31)
        .collect();
    if cleaned.trim().is_empty() {
        "Sheet1".to_string()
    } else {
        cleaned
    }
}

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
    fields: Vec<String>,
) -> R<u64> {
    let client = state.client(&conn_id)?;
    let c = client.database(&db).collection::<Document>(&coll);
    let filter_doc = parse_doc(&filter)?;
    let sort_doc = parse_doc(&sort)?;

    let mut find = c.find(filter_doc).limit(limit.max(1) as i64);
    if !sort_doc.is_empty() {
        find = find.sort(sort_doc);
    }
    // Only fetch the selected columns. Exclude _id explicitly when not chosen,
    // since Mongo includes it by default under an inclusion projection.
    if !fields.is_empty() {
        let mut proj = Document::new();
        for f in &fields {
            proj.insert(f.clone(), 1);
        }
        if !fields.iter().any(|f| f == "_id") {
            proj.insert("_id", 0);
        }
        find = find.projection(proj);
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
            let columns = export_columns(&docs, &fields);
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
            let columns = export_columns(&docs, &fields);
            let mut workbook = Workbook::new();
            let sheet = workbook.add_worksheet();
            sheet.set_name(sheet_name(&coll)).map_err(|e| e.to_string())?;

            // Branded header: teal fill, white bold text, centered.
            let header_fmt = Format::new()
                .set_bold()
                .set_font_color(Color::White)
                .set_background_color(Color::RGB(TUCANO_TEAL))
                .set_align(FormatAlign::Left)
                .set_align(FormatAlign::VerticalCenter)
                .set_border(FormatBorder::Thin)
                .set_border_color(Color::RGB(TUCANO_TEAL_DARK));
            // Body rows: thin grid + zebra striping for readability.
            let row_fmt = Format::new()
                .set_align(FormatAlign::VerticalCenter)
                .set_border(FormatBorder::Thin)
                .set_border_color(Color::RGB(GRID_LINE));
            let band_fmt = row_fmt.clone().set_background_color(Color::RGB(BAND_FILL));

            for (ci, col) in columns.iter().enumerate() {
                sheet
                    .write_string_with_format(0, ci as u16, col, &header_fmt)
                    .map_err(|e| e.to_string())?;
            }
            sheet.set_row_height(0, 22).map_err(|e| e.to_string())?;

            for (ri, d) in docs.iter().enumerate() {
                let fmt = if ri % 2 == 1 { &band_fmt } else { &row_fmt };
                sheet
                    .set_row_height((ri + 1) as u32, 18)
                    .map_err(|e| e.to_string())?;
                for (ci, col) in columns.iter().enumerate() {
                    let v = d.get(col).map(cell).unwrap_or_default();
                    let (row, col) = ((ri + 1) as u32, ci as u16);
                    // Blank-but-formatted cells keep the grid intact for missing fields.
                    if v.is_empty() {
                        sheet.write_blank(row, col, fmt).map_err(|e| e.to_string())?;
                    } else {
                        sheet
                            .write_string_with_format(row, col, &v, fmt)
                            .map_err(|e| e.to_string())?;
                    }
                }
            }

            // Freeze the header, add a filter dropdown, and size columns to fit.
            sheet.set_freeze_panes(1, 0).map_err(|e| e.to_string())?;
            if !columns.is_empty() && !docs.is_empty() {
                sheet
                    .autofilter(0, 0, docs.len() as u32, (columns.len() - 1) as u16)
                    .map_err(|e| e.to_string())?;
            }
            sheet.autofit();

            workbook.save(&path).map_err(|e| e.to_string())?;
        }
        other => return Err(format!("unsupported export format: {other}")),
    }

    Ok(count)
}

/// Columns for tabular export: the user's explicit selection (order preserved)
/// when provided, otherwise the union of top-level keys across all documents.
fn export_columns(docs: &[Document], fields: &[String]) -> Vec<String> {
    if !fields.is_empty() {
        return fields.to_vec();
    }
    collect_columns(docs)
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
