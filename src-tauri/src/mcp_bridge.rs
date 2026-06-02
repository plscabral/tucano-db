//! Local HTTP bridge that exposes read-only MongoDB access to MCP clients
//! (Claude Desktop / Code) via the companion `tucano-db-mcp` node package.
//! Bearer-token authenticated, bound to localhost only.

use crate::state::AppState;
use axum::{
    extract::{Query, State},
    http::{HeaderMap, StatusCode},
    routing::get,
    Json, Router,
};
use bson::{Bson, Document};
use futures::stream::TryStreamExt;
use serde::Deserialize;
use serde_json::{json, Value};
use std::net::SocketAddr;
use std::sync::Arc;

#[derive(Clone)]
struct Ctx {
    state: Arc<AppState>,
    token: String,
}

type Resp<T> = Result<Json<T>, (StatusCode, String)>;

fn auth(headers: &HeaderMap, token: &str) -> Result<(), (StatusCode, String)> {
    let got = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .unwrap_or("");
    if got == token {
        Ok(())
    } else {
        Err((StatusCode::UNAUTHORIZED, "invalid token".into()))
    }
}

pub fn spawn(state: Arc<AppState>, port: u16, token: String) {
    let (tx, rx) = tokio::sync::oneshot::channel::<()>();
    *state.mcp_stop_tx.lock() = Some(tx);

    let ctx = Ctx {
        state: state.clone(),
        token,
    };
    tokio::spawn(async move {
        let app = Router::new()
            .route("/health", get(health))
            .route("/connections", get(connections))
            .route("/databases", get(databases))
            .route("/collections", get(collections))
            .route("/find", get(find))
            .route("/overview", get(overview))
            .with_state(ctx);

        let addr = SocketAddr::from(([127, 0, 0, 1], port));
        match tokio::net::TcpListener::bind(addr).await {
            Ok(listener) => {
                tracing::info!("mcp bridge listening on {addr}");
                let _ = axum::serve(listener, app)
                    .with_graceful_shutdown(async move {
                        let _ = rx.await;
                    })
                    .await;
            }
            Err(e) => tracing::error!("mcp bridge bind failed: {e}"),
        }
    });
}

pub fn stop(state: &Arc<AppState>) {
    if let Some(tx) = state.mcp_stop_tx.lock().take() {
        let _ = tx.send(());
    }
}

async fn health() -> Json<Value> {
    Json(json!({ "ok": true, "service": "tucano-db" }))
}

async fn connections(State(ctx): State<Ctx>, headers: HeaderMap) -> Resp<Value> {
    auth(&headers, &ctx.token)?;
    let saved = ctx.state.saved.lock().clone();
    let active: Vec<String> = ctx.state.clients.lock().keys().cloned().collect();
    let list: Vec<Value> = saved
        .into_iter()
        .map(|c| json!({ "id": c.id, "name": c.name, "color": c.color, "active": active.contains(&c.id) }))
        .collect();
    Ok(Json(json!({ "connections": list })))
}

#[derive(Deserialize)]
struct ConnQ {
    conn: String,
}

async fn databases(State(ctx): State<Ctx>, headers: HeaderMap, Query(q): Query<ConnQ>) -> Resp<Value> {
    auth(&headers, &ctx.token)?;
    let client = ctx
        .state
        .client(&q.conn)
        .map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    let names = client
        .list_database_names()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(json!({ "databases": names })))
}

#[derive(Deserialize)]
struct DbQ {
    conn: String,
    db: String,
}

async fn collections(State(ctx): State<Ctx>, headers: HeaderMap, Query(q): Query<DbQ>) -> Resp<Value> {
    auth(&headers, &ctx.token)?;
    let client = ctx
        .state
        .client(&q.conn)
        .map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    let names = client
        .database(&q.db)
        .list_collection_names()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(json!({ "collections": names })))
}

#[derive(Deserialize)]
struct FindQ {
    conn: String,
    db: String,
    coll: String,
    filter: Option<String>,
    limit: Option<i64>,
}

async fn find(State(ctx): State<Ctx>, headers: HeaderMap, Query(q): Query<FindQ>) -> Resp<Value> {
    auth(&headers, &ctx.token)?;
    let client = ctx
        .state
        .client(&q.conn)
        .map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    let c = client.database(&q.db).collection::<Document>(&q.coll);

    let filter = match q.filter.as_deref() {
        Some(s) if !s.trim().is_empty() => {
            let v: Value = serde_json::from_str(s)
                .map_err(|e| (StatusCode::BAD_REQUEST, format!("bad filter: {e}")))?;
            match Bson::try_from(v).map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))? {
                Bson::Document(d) => d,
                _ => Document::new(),
            }
        }
        _ => Document::new(),
    };

    let cursor = c
        .find(filter)
        .limit(q.limit.unwrap_or(20).clamp(1, 200))
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let docs: Vec<Document> = cursor
        .try_collect()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let values: Vec<Value> = docs
        .into_iter()
        .map(|d| Bson::Document(d).into_relaxed_extjson())
        .collect();
    Ok(Json(json!({ "documents": values })))
}

async fn overview(State(ctx): State<Ctx>, headers: HeaderMap, Query(q): Query<ConnQ>) -> Resp<Value> {
    auth(&headers, &ctx.token)?;
    let client = ctx
        .state
        .client(&q.conn)
        .map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    let status = client
        .database("admin")
        .run_command(bson::doc! { "serverStatus": 1 })
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(Bson::Document(status).into_relaxed_extjson()))
}
