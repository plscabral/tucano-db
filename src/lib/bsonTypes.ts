// Interpret canonical MongoDB Extended JSON (as emitted by the Rust backend)
// to recover BSON types, humanize values, and assign per-type colors.

export type BsonType =
  | "objectId"
  | "string"
  | "int"
  | "long"
  | "double"
  | "decimal"
  | "bool"
  | "date"
  | "null"
  | "array"
  | "object"
  | "binary"
  | "regex"
  | "timestamp"
  | "minKey"
  | "maxKey"
  | "undefined"
  | "javascript"
  | "symbol";

type Json = unknown;

function keysOf(v: object): string[] {
  return Object.keys(v as Record<string, unknown>);
}

/** Detect the BSON type of a canonical Extended-JSON value. */
export function detectBsonType(v: Json): BsonType {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  const t = typeof v;
  if (t === "string") return "string";
  if (t === "boolean") return "bool";
  if (t === "number") return Number.isInteger(v as number) ? "int" : "double";
  if (t === "object") {
    const obj = v as Record<string, unknown>;
    const ks = keysOf(obj);
    if (ks.length === 1) {
      switch (ks[0]) {
        case "$oid":
          return "objectId";
        case "$numberInt":
          return "int";
        case "$numberLong":
          return "long";
        case "$numberDouble":
          return "double";
        case "$numberDecimal":
          return "decimal";
        case "$date":
          return "date";
        case "$timestamp":
          return "timestamp";
        case "$binary":
          return "binary";
        case "$regularExpression":
          return "regex";
        case "$minKey":
          return "minKey";
        case "$maxKey":
          return "maxKey";
        case "$undefined":
          return "undefined";
        case "$symbol":
          return "symbol";
        case "$code":
          return "javascript";
      }
    }
    if (ks.includes("$code")) return "javascript";
    return "object";
  }
  return "undefined";
}

/** A short, human-readable rendering of a scalar BSON value. */
export function displayValue(v: Json): string {
  const type = detectBsonType(v);
  switch (type) {
    case "null":
      return "null";
    case "string":
      return v as string;
    case "bool":
      return String(v);
    case "int":
    case "double":
      if (typeof v === "number") return String(v);
      break;
  }
  const obj = v as Record<string, unknown>;
  switch (type) {
    case "objectId":
      return String(obj.$oid);
    case "int":
      return String(obj.$numberInt);
    case "long":
      return String(obj.$numberLong);
    case "double":
      return String(obj.$numberDouble);
    case "decimal":
      return String(obj.$numberDecimal);
    case "date": {
      const d = obj.$date as Record<string, unknown> | string;
      const ms =
        typeof d === "string"
          ? Date.parse(d)
          : Number((d as Record<string, unknown>).$numberLong ?? 0);
      return new Date(ms).toISOString();
    }
    case "timestamp": {
      const ts = obj.$timestamp as Record<string, unknown>;
      return `Timestamp(${ts.t}, ${ts.i})`;
    }
    case "binary":
      return "Binary(…)";
    case "regex": {
      const r = obj.$regularExpression as Record<string, unknown>;
      return `/${r.pattern}/${r.options ?? ""}`;
    }
    case "javascript":
      return `Code(${String(obj.$code).slice(0, 24)}…)`;
    case "minKey":
      return "MinKey";
    case "maxKey":
      return "MaxKey";
    case "undefined":
      return "undefined";
    case "array":
      return `Array(${(v as unknown[]).length})`;
    case "object":
      return `{${keysOf(v as object).length} fields}`;
    default:
      return JSON.stringify(v);
  }
}

/** Raw epoch-ms for a date value, if this is a date (used by date formatting). */
export function dateMillis(v: Json): number | null {
  if (detectBsonType(v) !== "date") return null;
  const d = (v as Record<string, unknown>).$date as Record<string, unknown> | string;
  return typeof d === "string"
    ? Date.parse(d)
    : Number((d as Record<string, unknown>).$numberLong ?? 0);
}

/** Epoch-ms encoded in an ObjectId's first 4 bytes, if this is an ObjectId. */
export function objectIdDate(v: Json): number | null {
  if (detectBsonType(v) !== "objectId") return null;
  const hex = String((v as Record<string, unknown>).$oid ?? "");
  if (hex.length < 8) return null;
  const seconds = parseInt(hex.slice(0, 8), 16);
  return Number.isFinite(seconds) ? seconds * 1000 : null;
}

export function isContainer(v: Json): boolean {
  const t = detectBsonType(v);
  return t === "object" || t === "array";
}

/** Tailwind text-color class per BSON type (literal strings so Tailwind keeps them). */
export const TYPE_COLOR: Record<BsonType, string> = {
  objectId: "text-amber-500",
  string: "text-emerald-500",
  int: "text-sky-500",
  long: "text-sky-500",
  double: "text-cyan-500",
  decimal: "text-cyan-400",
  bool: "text-violet-500",
  date: "text-rose-400",
  null: "text-slate-400",
  array: "text-tucano-400",
  object: "text-foreground/70",
  binary: "text-orange-500",
  regex: "text-pink-500",
  timestamp: "text-rose-500",
  minKey: "text-slate-500",
  maxKey: "text-slate-500",
  undefined: "text-slate-500",
  javascript: "text-yellow-500",
  symbol: "text-fuchsia-500",
};

export const TYPE_LABEL: Record<BsonType, string> = {
  objectId: "ObjectId",
  string: "String",
  int: "Int32",
  long: "Int64",
  double: "Double",
  decimal: "Decimal128",
  bool: "Boolean",
  date: "Date",
  null: "Null",
  array: "Array",
  object: "Object",
  binary: "Binary",
  regex: "Regex",
  timestamp: "Timestamp",
  minKey: "MinKey",
  maxKey: "MaxKey",
  undefined: "Undefined",
  javascript: "Code",
  symbol: "Symbol",
};

/** Format a byte count as a compact human string (KB/MB/GB). */
export function formatBytes(bytes: number): string {
  if (!bytes || bytes < 1) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const n = bytes / Math.pow(1024, i);
  return `${n >= 100 || i === 0 ? Math.round(n) : n.toFixed(1)} ${units[i]}`;
}

/** Compact number formatting for counts (1.2k, 3.4M). */
export function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}
