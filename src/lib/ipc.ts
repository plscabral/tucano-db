import { invoke } from "@tauri-apps/api/core";
import type {
  AppSettings,
  CollectionInfo,
  Connection,
  ConnColor,
  DatabaseInfo,
  ExportFormat,
  FieldSchema,
  FindResult,
  HistoryEntry,
  IndexInfo,
  McpSettings,
  ServerOverview,
} from "./types";

/** Centralized Tauri command wrapper — one method per backend #[tauri::command]. */
export const ipc = {
  // ── connections ──────────────────────────────────────────────────────────
  listConnections: () => invoke<Connection[]>("list_connections"),
  activeConnections: () => invoke<string[]>("active_connections"),
  addConnection: (name: string, uri: string, color: ConnColor) =>
    invoke<Connection>("add_connection", { name, uri, color }),
  updateConnection: (id: string, name: string, uri: string, color: ConnColor) =>
    invoke<Connection>("update_connection", { id, name, uri, color }),
  setVisibleDatabases: (id: string, dbs: string[]) =>
    invoke<void>("set_visible_databases", { id, dbs }),
  removeConnection: (id: string) => invoke<void>("remove_connection", { id }),
  testConnection: (uri: string) => invoke<string>("test_connection", { uri }),
  connect: (id: string) => invoke<void>("connect", { id }),
  disconnect: (id: string) => invoke<void>("disconnect", { id }),

  // ── topology ─────────────────────────────────────────────────────────────
  listDatabases: (connId: string) =>
    invoke<DatabaseInfo[]>("list_databases", { connId }),
  listCollections: (connId: string, db: string) =>
    invoke<CollectionInfo[]>("list_collections", { connId, db }),

  // ── documents ────────────────────────────────────────────────────────────
  findDocuments: (args: {
    connId: string;
    db: string;
    coll: string;
    filter: string;
    sort: string;
    projection: string;
    page: number;
    pageSize: number;
    skip: number;
  }) => invoke<FindResult>("find_documents", args),
  aggregate: (args: {
    connId: string;
    db: string;
    coll: string;
    pipeline: string;
    limit: number;
  }) => invoke<Record<string, unknown>[]>("aggregate", args),
  insertDocument: (connId: string, db: string, coll: string, docJson: string) =>
    invoke<Record<string, unknown>>("insert_document", { connId, db, coll, docJson }),
  updateDocument: (connId: string, db: string, coll: string, docJson: string) =>
    invoke<void>("update_document", { connId, db, coll, docJson }),
  deleteDocument: (connId: string, db: string, coll: string, idJson: string) =>
    invoke<void>("delete_document", { connId, db, coll, idJson }),
  deleteMany: (connId: string, db: string, coll: string, filter: string) =>
    invoke<number>("delete_many", { connId, db, coll, filter }),

  // ── collection management ──────────────────────────────────────────────────
  createCollection: (connId: string, db: string, name: string) =>
    invoke<void>("create_collection", { connId, db, name }),
  dropCollection: (connId: string, db: string, coll: string) =>
    invoke<void>("drop_collection", { connId, db, coll }),
  renameCollection: (connId: string, db: string, coll: string, newName: string) =>
    invoke<void>("rename_collection", { connId, db, coll, newName }),
  duplicateCollection: (connId: string, db: string, coll: string, newName: string) =>
    invoke<void>("duplicate_collection", { connId, db, coll, newName }),
  createDatabase: (connId: string, db: string, firstCollection: string) =>
    invoke<void>("create_database", { connId, db, firstCollection }),
  dropDatabase: (connId: string, db: string) =>
    invoke<void>("drop_database", { connId, db }),

  // ── indexes ──────────────────────────────────────────────────────────────
  listIndexes: (connId: string, db: string, coll: string) =>
    invoke<IndexInfo[]>("list_indexes", { connId, db, coll }),
  createIndex: (connId: string, db: string, coll: string, keys: string, unique: boolean) =>
    invoke<void>("create_index", { connId, db, coll, keys, unique }),
  dropIndex: (connId: string, db: string, coll: string, name: string) =>
    invoke<void>("drop_index", { connId, db, coll, name }),

  // ── schema / autocomplete ──────────────────────────────────────────────────
  sampleFields: (connId: string, db: string, coll: string, sample: number) =>
    invoke<FieldSchema[]>("sample_fields", { connId, db, coll, sample }),

  // ── overview ─────────────────────────────────────────────────────────────
  serverOverview: (connId: string) =>
    invoke<ServerOverview>("server_overview", { connId }),

  // ── history ──────────────────────────────────────────────────────────────
  listHistory: (connId: string, db: string, coll: string, limit: number) =>
    invoke<HistoryEntry[]>("list_history", { connId, db, coll, limit }),
  getHistoryEntry: (id: string) =>
    invoke<HistoryEntry | null>("get_history_entry", { id }),
  historyCollections: (connId: string, db: string) =>
    invoke<{ coll: string; count: number }[]>("history_collections", { connId, db }),
  restoreHistoryEntry: (id: string) => invoke<void>("restore_history_entry", { id }),
  deleteHistoryEntry: (id: string) => invoke<void>("delete_history_entry", { id }),
  clearHistory: (connId: string, db: string, coll: string) =>
    invoke<void>("clear_history", { connId, db, coll }),

  // ── settings ─────────────────────────────────────────────────────────────
  getSettings: () => invoke<AppSettings>("get_settings"),
  setSettings: (settings: AppSettings) => invoke<void>("set_settings", { settings }),

  // ── export ───────────────────────────────────────────────────────────────
  exportDocuments: (args: {
    connId: string;
    db: string;
    coll: string;
    filter: string;
    sort: string;
    limit: number;
    format: ExportFormat;
    path: string;
  }) => invoke<number>("export_documents", args),

  // ── mcp ──────────────────────────────────────────────────────────────────
  getMcpSettings: () => invoke<McpSettings>("get_mcp_settings"),
  setMcpSettings: (settings: McpSettings) => invoke<void>("set_mcp_settings", { settings }),
  rotateMcpToken: () => invoke<string>("rotate_mcp_token"),
  listMcpClients: () =>
    invoke<{ id: string; name: string; installed: boolean; configPath: string }[]>(
      "list_mcp_clients"
    ),
  installMcpClient: (id: string) => invoke<void>("install_mcp_client", { id }),
  uninstallMcpClient: (id: string) => invoke<void>("uninstall_mcp_client", { id }),
};
