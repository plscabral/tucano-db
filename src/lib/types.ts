// Shared data contracts mirrored by the Rust DTOs (#[serde(rename_all="camelCase")]).

/** Color tag for a saved server connection (maps to a palette in bsonTypes/theme). */
export type ConnColor =
  | "teal"
  | "coral"
  | "violet"
  | "amber"
  | "emerald"
  | "rose"
  | "sky"
  | "slate";

export const CONN_COLORS: ConnColor[] = [
  "teal",
  "coral",
  "violet",
  "amber",
  "emerald",
  "rose",
  "sky",
  "slate",
];

/** Hex values for each connection color tag (dot + accent). */
export const CONN_COLOR_HEX: Record<ConnColor, string> = {
  teal: "#1A96AD",
  coral: "#FF6B5B",
  violet: "#6A57E0",
  amber: "#E0A020",
  emerald: "#10B981",
  rose: "#F43F5E",
  sky: "#38BDF8",
  slate: "#64748B",
};

export interface Connection {
  id: string;
  name: string;
  uri: string;
  color: ConnColor;
  createdAt: number;
  lastConnected: number | null;
  /** Databases shown in the sidebar. Empty = show all. */
  visibleDbs: string[];
  /** Development, staging or production. Defaults to development for saved connections. */
  environment: Environment;
  /** Prevent all database mutations for this connection. */
  readOnly: boolean;
}

export type Environment = "development" | "staging" | "production";

export interface DatabaseInfo {
  name: string;
  sizeOnDisk: number;
  empty: boolean;
}

export interface CollectionInfo {
  name: string;
  type: string; // "collection" | "view" | "timeseries"
  count: number;
  size: number; // dataSize, bytes
  storageSize: number;
  avgObjSize: number;
  indexCount: number;
  indexSize: number;
}

/** Result of find_documents — docs are Extended-JSON to keep BSON type fidelity. */
export interface FindResult {
  docs: Record<string, unknown>[];
  filteredCount: number;
  totalCount: number;
  page: number;
  pageSize: number;
  elapsedMs: number;
}

export interface IndexInfo {
  name: string;
  keys: Record<string, unknown>;
  unique: boolean;
  sparse: boolean;
}

/** A field path + the BSON types and representative values observed in a sample. */
export interface FieldSchema {
  path: string;
  types: string[];
  present: number;
  sampleValues: unknown[];
  indexNames: string[];
}

export interface SchemaIndex {
  name: string;
  keys: Record<string, unknown>;
  unique: boolean;
  sparse: boolean;
}

/** Read-only collection schema report built from sampled documents and indexes. */
export interface SchemaAnalysis {
  sampledDocuments: number;
  fields: FieldSchema[];
  indexes: SchemaIndex[];
}

export interface ServerOverview {
  version: string;
  host: string;
  uptimeSeconds: number;
  connectionsCurrent: number;
  connectionsAvailable: number;
  opcounters: Record<string, number>;
  memResidentMb: number;
  memVirtualMb: number;
  networkBytesIn: number;
  networkBytesOut: number;
  databases: DatabaseInfo[];
  totalDataSize: number;
  totalStorageSize: number;
  totalCollections: number;
}

export type HistoryOp = "insert" | "update" | "replace" | "delete" | "deleteMany";

export interface HistoryEntry {
  id: string;
  connId: string;
  db: string;
  coll: string;
  op: HistoryOp;
  beforeJson: string | null;
  afterJson: string | null;
  ts: number;
}

export type Language = "en" | "pt-BR" | "es";
export type ExportFormat = "csv" | "xlsx" | "json";

export type DateMode = "iso" | "locale" | "custom";

export interface AppSettings {
  language: Language;
  /** "local" | "UTC" | "+HH:MM" | "-HH:MM" */
  timezone: string;
  dateMode: DateMode;
  dateFormat: string; // custom token format, e.g. "YYYY-MM-DD HH:mm:ss"
  defaultPageSize: number;
  exportFormat: ExportFormat;
  /** Auto-run the default query when a collection is opened. */
  autoExecute: boolean;
  /** Template for the initial query when opening a collection (supports {coll}). */
  initialScript: string;
  /** Record updates/deletes to collection history for restore. */
  recordUpdates: boolean;
  /** Record inserts so they can be undone from collection history. */
  recordInserts: boolean;
  recordDeletes: boolean;
}

export interface McpSettings {
  enabled: boolean;
  port: number;
  token: string;
}

/** Document view modes in the workspace. */
export type ViewMode = "tree" | "table" | "json" | "html";

/** A query describing what find_documents should fetch. */
export interface DocQuery {
  filter: string; // JSON string ("{}" = all)
  sort: string; // JSON string ("" = none)
  projection: string; // JSON string ("" = none)
  page: number;
  pageSize: number;
}
