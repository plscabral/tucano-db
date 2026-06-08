// Parse a NoSQLBooster / mongo-shell style query into a backend call.
// Supports the common chains:
//   db.coll.find(<filter>, <projection>).sort(<sort>).skip(n).limit(n).project(<proj>)
//   db.coll.aggregate(<pipeline>).limit(n)
//   db.coll.countDocuments(<filter>)  /  db.coll.count(<filter>)
// Arguments may use JS-object syntax (unquoted keys, single quotes, trailing
// commas) and shell constructors (ObjectId, ISODate, NumberLong, …).

import JSON5 from "json5";

export type ParsedQuery =
  | {
      kind: "find";
      coll: string;
      filter: string;
      sort: string;
      projection: string;
      limit?: number;
      skip?: number;
    }
  | { kind: "aggregate"; coll: string; pipeline: string; limit?: number }
  | { kind: "count"; coll: string; filter: string };

/**
 * Rewrite JS regex literals (`/pattern/flags`) into the canonical Extended JSON
 * the backend understands (`{"$regularExpression":{"pattern":…,"options":…}}`).
 *
 * Runs over the *whole* query before any brace-depth scanning so that a regex
 * containing `(`, `[`, `{`, `,` … never corrupts argument splitting. A `/` is
 * treated as the start of a regex only when it sits in a value position — right
 * after `:`, `,`, `[`, `(`, or at the very start — which is where Mongo filters
 * place them; everywhere else (e.g. a stray division) it is left untouched.
 */
function transformRegexLiterals(src: string): string {
  let out = "";
  let inStr: string | null = null;
  let prev = ""; // last non-whitespace char emitted in code context
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inStr) {
      out += ch;
      if (ch === "\\") out += src[++i] ?? "";
      else if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inStr = ch;
      out += ch;
      prev = ch;
      continue;
    }
    if (ch === "/" && (prev === "" || ":,[({".includes(prev))) {
      let j = i + 1;
      let pattern = "";
      let inClass = false;
      let closed = false;
      while (j < src.length) {
        const c = src[j];
        if (c === "\\") {
          pattern += c + (src[j + 1] ?? "");
          j += 2;
          continue;
        }
        if (c === "\n") break; // unterminated → not a regex
        if (c === "[") inClass = true;
        else if (c === "]") inClass = false;
        else if (c === "/" && !inClass) {
          closed = true;
          break;
        }
        pattern += c;
        j++;
      }
      if (closed) {
        let k = j + 1;
        let flags = "";
        while (k < src.length && /[a-z]/i.test(src[k])) flags += src[k++];
        // Mongo only honours i/m/s/x; drop JS-only flags (g/u/y/d) so the
        // server doesn't reject the query.
        const options = [...new Set(flags.toLowerCase())].filter((f) => "imsx".includes(f)).join("");
        out += JSON.stringify({ $regularExpression: { pattern, options } });
        prev = "}";
        i = k - 1;
        continue;
      }
      // Not a terminated regex literal — emit the `/` verbatim.
    }
    out += ch;
    if (!/\s/.test(ch)) prev = ch;
  }
  return out;
}

/** Rewrite shell constructors into the Extended JSON the backend understands. */
function preprocess(src: string): string {
  return src
    .replace(/ObjectId\(\s*(['"])([0-9a-fA-F]{24})\1\s*\)/g, '{"$oid":"$2"}')
    .replace(/ISODate\(\s*(['"])([^'"]*)\1\s*\)/g, '{"$date":"$2"}')
    .replace(/new\s+Date\(\s*(['"])([^'"]*)\1\s*\)/g, '{"$date":"$2"}')
    .replace(/NumberLong\(\s*(['"]?)(-?\d+)\1\s*\)/g, '{"$numberLong":"$2"}')
    .replace(/NumberInt\(\s*(['"]?)(-?\d+)\1\s*\)/g, '{"$numberInt":"$2"}')
    .replace(/NumberDecimal\(\s*(['"])([^'"]+)\1\s*\)/g, '{"$numberDecimal":"$2"}');
}

/** A 24-char hex string is the textual form of an ObjectId. */
const HEX24 = /^[0-9a-fA-F]{24}$/;

/** Keys that mark an already-typed Extended-JSON value (vs. a query operator). */
const EXTJSON_MARKERS = new Set([
  "$oid",
  "$date",
  "$numberInt",
  "$numberLong",
  "$numberDouble",
  "$numberDecimal",
  "$timestamp",
  "$binary",
  "$regularExpression",
  "$minKey",
  "$maxKey",
  "$undefined",
  "$symbol",
  "$code",
  "$scope",
  "$dbPointer",
  "$ref",
]);

/**
 * Mongo stores `_id` as an ObjectId by default, so let users write
 * `_id: "<24-hex>"` (or `_id: { $in: ["<24-hex>", …] }`) and treat the plain
 * string as an ObjectId — no `ObjectId(…)` / `{$oid:…}` ceremony required.
 * Only kicks in for `_id` keys whose value is exactly a 24-char hex string;
 * anything else (real string ids, non-hex values) is left untouched.
 */
function coerceIdStrings(value: unknown, key?: string): unknown {
  if (typeof value === "string") {
    return key === "_id" && HEX24.test(value) ? { $oid: value } : value;
  }
  if (Array.isArray(value)) return value.map((v) => coerceIdStrings(v, key));
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    // A typed wrapper ({$oid}, {$date}, …) is opaque — never look inside it.
    if (Object.keys(obj).some((k) => EXTJSON_MARKERS.has(k))) return obj;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      // operators ($in, $eq, …) under an _id key inherit the _id context.
      out[k] = coerceIdStrings(v, k.startsWith("$") ? key : k);
    }
    return out;
  }
  return value;
}

/** Convert a JS object/array literal into a strict JSON string. */
function toJson(src: string): string {
  const s = src.trim();
  if (!s) return "";
  const value = coerceIdStrings(JSON5.parse(preprocess(s)));
  return JSON.stringify(value);
}

/** Render an object key for shell source: unquoted when a valid identifier. */
function shellKey(k: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k);
}

const SHELL_INDENT = "  ";
/** Objects/arrays whose inline form exceeds this width are broken onto lines. */
const SHELL_WIDTH = 72;

/**
 * Render a value (parsed from canonical Extended JSON) as mongo-shell source —
 * the inverse of {@link preprocess}. Recovers `ObjectId(…)`, `ISODate(…)`,
 * `NumberLong(…)` … so generated queries read the way a human would type them
 * instead of leaking `{"$oid":…}` / `{"$date":{"$numberLong":…}}` wrappers.
 * Compound values stay inline while short and wrap onto indented lines once
 * they grow past {@link SHELL_WIDTH}.
 */
export function toShellLiteral(value: unknown, depth = 0): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);

  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const items = value.map((v) => toShellLiteral(v, depth + 1));
    const inline = `[${items.join(", ")}]`;
    if (inline.length + depth * 2 <= SHELL_WIDTH && !inline.includes("\n")) return inline;
    const pad = SHELL_INDENT.repeat(depth + 1);
    return `[\n${items.map((i) => pad + i).join(",\n")}\n${SHELL_INDENT.repeat(depth)}]`;
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const ks = Object.keys(obj);
    if (ks.length === 1) {
      const inner = obj[ks[0]];
      switch (ks[0]) {
        case "$oid":
          return `ObjectId("${inner}")`;
        case "$date": {
          const ms =
            typeof inner === "string"
              ? Date.parse(inner)
              : Number((inner as Record<string, unknown>)?.$numberLong ?? inner ?? 0);
          return `ISODate("${new Date(ms).toISOString()}")`;
        }
        case "$numberLong":
          return `NumberLong("${inner}")`;
        case "$numberDecimal":
          return `NumberDecimal("${inner}")`;
        case "$numberInt":
        case "$numberDouble":
          return String(inner);
        case "$regularExpression": {
          const r = inner as Record<string, unknown>;
          return `/${r.pattern}/${r.options ?? ""}`;
        }
      }
    }
    if (ks.length === 0) return "{}";
    const entries = ks.map((k) => `${shellKey(k)}: ${toShellLiteral(obj[k], depth + 1)}`);
    const inline = `{ ${entries.join(", ")} }`;
    if (inline.length + depth * 2 <= SHELL_WIDTH && !inline.includes("\n")) return inline;
    const pad = SHELL_INDENT.repeat(depth + 1);
    return `{\n${entries.map((e) => pad + e).join(",\n")}\n${SHELL_INDENT.repeat(depth)}}`;
  }
  return JSON.stringify(value);
}

/** Split top-level comma-separated arguments, respecting nesting and strings. */
function splitTopArgs(args: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inStr: string | null = null;
  let cur = "";
  for (let i = 0; i < args.length; i++) {
    const ch = args[i];
    if (inStr) {
      cur += ch;
      if (ch === "\\") cur += args[++i] ?? "";
      else if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inStr = ch;
      cur += ch;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    if (ch === ")" || ch === "]" || ch === "}") depth--;
    if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts.map((s) => s.trim()).filter(Boolean);
}

/** Extract the `.method(args)` chain from the text after `db.coll`. */
function extractCalls(rest: string): { name: string; args: string }[] {
  const calls: { name: string; args: string }[] = [];
  let i = 0;
  while (i < rest.length) {
    const dot = rest.indexOf(".", i);
    if (dot === -1) break;
    let j = dot + 1;
    while (j < rest.length && /[A-Za-z0-9_]/.test(rest[j])) j++;
    const name = rest.slice(dot + 1, j);
    while (j < rest.length && /\s/.test(rest[j])) j++;
    if (rest[j] !== "(") {
      i = j;
      continue;
    }
    const start = j + 1;
    let depth = 1;
    let k = start;
    let inStr: string | null = null;
    while (k < rest.length && depth > 0) {
      const ch = rest[k];
      if (inStr) {
        if (ch === "\\") k++;
        else if (ch === inStr) inStr = null;
      } else if (ch === '"' || ch === "'" || ch === "`") inStr = ch;
      else if (ch === "(" || ch === "[" || ch === "{") depth++;
      else if (ch === ")" || ch === "]" || ch === "}") depth--;
      k++;
    }
    calls.push({ name, args: rest.slice(start, k - 1) });
    i = k;
  }
  return calls;
}

export function parseQuery(text: string): ParsedQuery {
  const src = transformRegexLiterals(text.trim().replace(/;+\s*$/, ""));
  const m = src.match(/db\s*\.\s*(?:getCollection\(\s*['"]([^'"]+)['"]\s*\)|([\w$]+))/);
  if (!m) throw new Error("Query must start with db.<collection>");
  const coll = m[1] || m[2];
  const rest = src.slice((m.index ?? 0) + m[0].length);
  const calls = extractCalls(rest);
  const first = calls[0];

  // Default / find / findOne
  if (!first || first.name === "find" || first.name === "findOne") {
    let filter = "{}";
    let sort = "";
    let projection = "";
    let limit: number | undefined = first?.name === "findOne" ? 1 : undefined;
    let skip: number | undefined;
    if (first && (first.name === "find" || first.name === "findOne")) {
      const parts = splitTopArgs(first.args);
      if (parts[0]) filter = toJson(parts[0]);
      if (parts[1]) projection = toJson(parts[1]);
    }
    for (const c of calls.slice(first ? 1 : 0)) {
      if (c.name === "sort") sort = toJson(c.args);
      else if (c.name === "project" || c.name === "projection") projection = toJson(c.args);
      else if (c.name === "limit") limit = Number(c.args.trim()) || undefined;
      else if (c.name === "skip") skip = Number(c.args.trim()) || undefined;
    }
    return { kind: "find", coll, filter: filter || "{}", sort, projection, limit, skip };
  }

  if (first.name === "aggregate") {
    let limit: number | undefined;
    for (const c of calls.slice(1)) if (c.name === "limit") limit = Number(c.args.trim()) || undefined;
    return { kind: "aggregate", coll, pipeline: toJson(first.args), limit };
  }

  if (first.name === "count" || first.name === "countDocuments" || first.name === "estimatedDocumentCount") {
    const parts = splitTopArgs(first.args);
    return { kind: "count", coll, filter: parts[0] ? toJson(parts[0]) : "{}" };
  }

  throw new Error(
    `.${first.name}() can't run yet — the runner supports find, findOne, aggregate, count and countDocuments.`
  );
}

/** `db.<coll>` reference, escaping names that aren't valid identifiers. */
export function collRef(coll: string): string {
  return `db.${/^[A-Za-z_$][\w$]*$/.test(coll) ? coll : `getCollection("${coll}")`}`;
}

/** The default query text shown when a collection is opened. */
export function defaultQuery(coll: string): string {
  return `${collRef(coll)}.find({})\n    .projection({})\n    .sort({ _id: -1 })\n    .limit(50)`;
}

/** True when the argument was actually supplied (even as `{}`), so it's kept. */
function isPresent(s: string | undefined): boolean {
  return (s ?? "").trim() !== "";
}

/**
 * Reconstruct a mongo-shell `find()` query as a chained, multi-line statement —
 * `.projection()/.sort()/.skip()/.limit()` on their own indented lines, each
 * stage kept only when it was present. JSON-string args are re-emitted as shell
 * literals so the result matches the editor's default script style.
 */
export function serializeFind(p: {
  coll: string;
  filter: string;
  sort?: string;
  projection?: string;
  limit?: number;
  skip?: number;
}): string {
  let out = `${collRef(p.coll)}.find(${jsonToShell(p.filter) || "{}"})`;
  if (isPresent(p.projection)) out += `\n    .projection(${jsonToShell(p.projection)})`;
  if (isPresent(p.sort)) out += `\n    .sort(${jsonToShell(p.sort)})`;
  if (p.skip && p.skip > 0) out += `\n    .skip(${p.skip})`;
  if (p.limit !== undefined) out += `\n    .limit(${p.limit})`;
  return out;
}

/** Merge `{path: value}` into a JSON-string filter, returning shell source. */
export function mergeFilter(filterJson: string, path: string, value: unknown): string {
  let obj: Record<string, unknown> = {};
  const t = (filterJson ?? "").trim();
  if (t && t !== "{}") {
    try {
      const parsed = JSON.parse(t);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) obj = parsed;
    } catch {
      /* unparseable filter → start fresh */
    }
  }
  obj[path] = value;
  return toShellLiteral(obj);
}

/** Add `{path: value}` to an aggregate's leading `$match` (or prepend one). */
export function serializeAggregateWithMatch(
  p: { coll: string; pipeline: string; limit?: number },
  path: string,
  value: unknown
): string {
  let stages: unknown[] = [];
  try {
    const parsed = JSON.parse(p.pipeline || "[]");
    if (Array.isArray(parsed)) stages = parsed;
  } catch {
    /* unparseable pipeline → start fresh */
  }
  const first = stages[0] as Record<string, unknown> | undefined;
  if (first && typeof first === "object" && first.$match && typeof first.$match === "object") {
    (first.$match as Record<string, unknown>)[path] = value;
  } else {
    stages.unshift({ $match: { [path]: value } });
  }
  let out = `${collRef(p.coll)}.aggregate(${toShellLiteral(stages)})`;
  if (p.limit !== undefined) out += `.limit(${p.limit})`;
  return out;
}

// ── SQL mode (for users more familiar with SQL) ──────────────────────────────

export type QueryLang = "mongo" | "sql";

function sqlValue(raw: string): unknown {
  const s = raw.trim();
  if (/^'.*'$/.test(s) || /^".*"$/.test(s)) return s.slice(1, -1);
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  if (/^-?\d*\.\d+$/.test(s)) return parseFloat(s);
  if (/^true$/i.test(s)) return true;
  if (/^false$/i.test(s)) return false;
  if (/^null$/i.test(s)) return null;
  return s.replace(/^['"]|['"]$/g, "");
}

const OP_MAP: Record<string, string> = {
  ">": "$gt",
  ">=": "$gte",
  "<": "$lt",
  "<=": "$lte",
  "!=": "$ne",
  "<>": "$ne",
};

function sqlCondition(cond: string): Record<string, unknown> {
  let m = cond.match(/^\s*([\w.]+)\s+IN\s*\((.*)\)\s*$/i);
  if (m) return { [m[1]]: { $in: m[2].split(",").map(sqlValue) } };

  m = cond.match(/^\s*([\w.]+)\s+LIKE\s+(.+)$/i);
  if (m) {
    const pat = String(sqlValue(m[2])).replace(/%/g, ".*").replace(/_/g, ".");
    return { [m[1]]: { $regex: pat, $options: "i" } };
  }

  m = cond.match(/^\s*([\w.]+)\s*(=|!=|<>|>=|<=|>|<)\s*(.+)$/);
  if (m) {
    const [, field, op, raw] = m;
    const val = sqlValue(raw);
    return op === "=" ? { [field]: val } : { [field]: { [OP_MAP[op]]: val } };
  }
  throw new Error(`Cannot parse condition: ${cond}`);
}

function parseWhere(where: string): Record<string, unknown> {
  const ors = where.split(/\s+OR\s+/i);
  if (ors.length > 1) return { $or: ors.map(parseWhere) };
  const merged: Record<string, unknown> = {};
  for (const part of where.split(/\s+AND\s+/i)) Object.assign(merged, sqlCondition(part));
  return merged;
}

/** Translate a basic SQL SELECT into a Mongo find/count. */
export function parseSql(text: string): ParsedQuery {
  const src = text.trim().replace(/;+\s*$/, "");
  const m = src.match(/^\s*SELECT\s+([\s\S]+?)\s+FROM\s+([\w.$]+)([\s\S]*)$/i);
  if (!m) throw new Error("SQL must be: SELECT … FROM <collection> …");
  const cols = m[1].trim();
  const coll = m[2];
  const rest = m[3];

  const whereM = rest.match(/\bWHERE\s+([\s\S]+?)(?:\bORDER\s+BY\b|\bLIMIT\b|\bOFFSET\b|\bSKIP\b|$)/i);

  if (/^count\s*\(\s*\*?\s*\)$/i.test(cols)) {
    const filter = whereM ? JSON.stringify(parseWhere(whereM[1].trim())) : "{}";
    return { kind: "count", coll, filter };
  }

  const orderM = rest.match(/\bORDER\s+BY\s+([\s\S]+?)(?:\bLIMIT\b|\bOFFSET\b|\bSKIP\b|$)/i);
  const limitM = rest.match(/\bLIMIT\s+(\d+)/i);
  const offsetM = rest.match(/\b(?:OFFSET|SKIP)\s+(\d+)/i);

  let projection = "";
  if (cols !== "*") {
    const proj: Record<string, number> = {};
    for (const c of cols.split(",").map((x) => x.trim()).filter(Boolean)) proj[c] = 1;
    projection = JSON.stringify(proj);
  }

  let sort = "";
  if (orderM) {
    const sortObj: Record<string, number> = {};
    for (const part of orderM[1].split(",")) {
      const [f, dir] = part.trim().split(/\s+/);
      if (f) sortObj[f] = /desc/i.test(dir || "") ? -1 : 1;
    }
    sort = JSON.stringify(sortObj);
  }

  return {
    kind: "find",
    coll,
    filter: whereM ? JSON.stringify(parseWhere(whereM[1].trim())) : "{}",
    sort,
    projection,
    limit: limitM ? parseInt(limitM[1], 10) : undefined,
    skip: offsetM ? parseInt(offsetM[1], 10) : undefined,
  };
}

/** Parse a query in the given language. */
export function parse(lang: QueryLang, text: string): ParsedQuery {
  return lang === "sql" ? parseSql(text) : parseQuery(text);
}

/** Re-emit a parser's JSON-string argument as pretty mongo-shell source. */
function jsonToShell(json: string | undefined): string {
  const t = (json ?? "").trim();
  if (!t) return "";
  try {
    return toShellLiteral(JSON.parse(t));
  } catch {
    return t;
  }
}

/** Pretty-print a mongo query: parse it, then re-serialize with shell literals. */
function formatMongo(text: string): string {
  const p = parseQuery(text);
  if (p.kind === "find") {
    // serializeFind already re-emits each arg as a shell literal.
    return serializeFind(p);
  }
  if (p.kind === "aggregate") {
    let out = `${collRef(p.coll)}.aggregate(${jsonToShell(p.pipeline)})`;
    if (p.limit !== undefined) out += `.limit(${p.limit})`;
    return out;
  }
  const filter = jsonToShell(p.filter);
  return `${collRef(p.coll)}.countDocuments(${filter === "{}" ? "" : filter})`;
}

const SQL_KEYWORDS_FMT = [
  "SELECT", "FROM", "WHERE", "GROUP BY", "HAVING", "ORDER BY", "LIMIT", "OFFSET",
  "SKIP", "AND", "OR", "ASC", "DESC", "LIKE", "IN", "NOT", "NULL", "AS", "IS",
  "DISTINCT", "BETWEEN", "ON", "JOIN", "LEFT", "RIGHT", "INNER", "OUTER", "COUNT",
];
/** Clauses that start a fresh line. */
const SQL_CLAUSES = ["FROM", "WHERE", "GROUP BY", "HAVING", "ORDER BY", "LIMIT", "OFFSET", "SKIP"];

/** Pretty-print a SQL query: canonical keyword case + a line per clause. */
function formatSql(text: string): string {
  const src = text.trim().replace(/;+\s*$/, "");
  // Split off quoted strings so keyword casing never touches their contents.
  const segs = src.split(/('(?:[^']|'')*'|"(?:[^"]|"")*")/);
  let s = segs
    .map((seg, i) => {
      if (i % 2 === 1) return seg; // quoted literal
      let code = seg.replace(/\s+/g, " ");
      for (const k of SQL_KEYWORDS_FMT)
        code = code.replace(new RegExp(`\\b${k.replace(/ /g, "\\s+")}\\b`, "gi"), k);
      return code;
    })
    .join("");
  for (const c of SQL_CLAUSES)
    s = s.replace(new RegExp(`\\s+(${c.replace(/ /g, "\\s+")})\\b`, "g"), `\n$1`);
  s = s.replace(/ +(AND|OR)\b/g, "\n  $1");
  return s
    .split("\n")
    .map((l) => l.trimEnd())
    .join("\n")
    .trim();
}

/** Pretty-print a query in the given language; throws on unparseable mongo. */
export function formatQuery(lang: QueryLang, text: string): string {
  return lang === "sql" ? formatSql(text) : formatMongo(text);
}

/** Default query text for a language + collection. */
export function defaultQueryFor(lang: QueryLang, coll: string): string {
  return lang === "sql" ? `SELECT * FROM ${coll} LIMIT 50` : defaultQuery(coll);
}
