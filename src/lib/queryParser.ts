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

/** Convert a JS object/array literal into a strict JSON string. */
function toJson(src: string): string {
  const s = src.trim();
  if (!s) return "";
  const value = JSON5.parse(preprocess(s));
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
  const src = text.trim().replace(/;+\s*$/, "");
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

/** The default query text shown when a collection is opened. */
export function defaultQuery(coll: string): string {
  return `db.${/^[A-Za-z_$][\w$]*$/.test(coll) ? coll : `getCollection("${coll}")`}.find({})`;
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

/** Default query text for a language + collection. */
export function defaultQueryFor(lang: QueryLang, coll: string): string {
  return lang === "sql" ? `SELECT * FROM ${coll} LIMIT 50` : defaultQuery(coll);
}
