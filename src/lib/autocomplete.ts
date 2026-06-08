import {
  autocompletion,
  snippetCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import type { Extension } from "@codemirror/state";
import type { FieldSchema } from "./types";

/** Is `s` a bare JS identifier (so it can be an unquoted object key)? */
const isIdent = (s: string) => /^[A-Za-z_$][\w$]*$/.test(s);

/**
 * CodeMirror snippet for a field's *value*, picked from its observed BSON type,
 * so selecting a field drops you into the right literal: a string gets `"…"`,
 * an ObjectId `ObjectId("…")`, a date `ISODate("…")`, etc. `${}` marks where
 * the cursor lands. `json` emits Extended-JSON value forms for the strict-JSON
 * editor instead of shell constructors.
 */
function valueSnippet(types: string[], json = false): string {
  const t = types.find((x) => x && x !== "null") ?? "string";
  switch (t) {
    case "objectId":
      return json ? '{ "$oid": "${}" }' : 'ObjectId("${}")';
    case "date":
      return json ? '{ "$date": "${}" }' : 'ISODate("${}")';
    case "bool":
      return "${false}";
    case "int":
    case "long":
    case "double":
    case "decimal":
      return "${}";
    case "array":
      return "[${}]";
    case "object":
      return "{${}}";
    default:
      return '"${}"';
  }
}

/** MongoDB query operators surfaced in the filter editor. */
const OPERATORS: Completion[] = [
  "$eq",
  "$ne",
  "$gt",
  "$gte",
  "$lt",
  "$lte",
  "$in",
  "$nin",
  "$and",
  "$or",
  "$not",
  "$nor",
  "$exists",
  "$type",
  "$regex",
  "$options",
  "$elemMatch",
  "$size",
  "$all",
  "$mod",
  "$text",
  "$where",
].map((label) => ({ label, type: "keyword", detail: "operator" }));

/**
 * Build a CodeMirror autocomplete extension fed by sampled collection fields
 * plus the MongoDB operator list. Field completions are quoted JSON keys.
 */
export function mongoAutocomplete(fields: FieldSchema[]): Extension {
  // Name-only (when a value already follows) vs. key + typed value snippet.
  const nameOnly: Completion[] = fields.map((f) => ({
    label: `"${f.path}"`,
    type: "property",
    detail: f.types.join(" | "),
    boost: 1,
  }));
  const withValue: Completion[] = fields.map((f) =>
    snippetCompletion(`"${f.path}": ${valueSnippet(f.types, true)}`, {
      label: `"${f.path}"`,
      type: "property",
      detail: f.types.join(" | "),
      boost: 1,
    })
  );

  const source = (ctx: CompletionContext): CompletionResult | null => {
    // Operators trigger right after `$`.
    const dollar = ctx.matchBefore(/\$\w*/);
    if (dollar) {
      return {
        from: dollar.from,
        options: OPERATORS,
        validFor: /^\$\w*$/,
      };
    }
    // Field names: a bare word or an opening quote.
    const word = ctx.matchBefore(/"?[\w.]*/);
    if (!word || (word.from === word.to && !ctx.explicit)) return null;
    return {
      from: word.from,
      options: hasValueAhead(ctx) ? nameOnly : withValue,
      validFor: /^"?[\w.]*"?$/,
    };
  };

  return autocompletion({ override: [source], icons: false });
}

/** A `:` already follows the cursor → the key has a value; don't add one. */
function hasValueAhead(ctx: CompletionContext): boolean {
  const after = ctx.state.sliceDoc(ctx.pos, Math.min(ctx.state.doc.length, ctx.pos + 40));
  return /^"?\s*:/.test(after);
}

const mkMethods = (names: string[]): Completion[] =>
  names.map((label) => ({ label, type: "method", detail: "method" }));

/** Collection methods (mirrors NoSQLBooster's `db.coll.` completions). */
const COLLECTION_METHODS = mkMethods([
  "find",
  "findOne",
  "findOneAndDelete",
  "findOneAndReplace",
  "findOneAndUpdate",
  "findAndModify",
  "insertOne",
  "insertMany",
  "insert",
  "updateOne",
  "updateMany",
  "update",
  "replaceOne",
  "deleteOne",
  "deleteMany",
  "remove",
  "save",
  "countDocuments",
  "estimatedDocumentCount",
  "count",
  "distinct",
  "aggregate",
  "bulkWrite",
  "createIndex",
  "createIndexes",
  "dropIndex",
  "dropIndexes",
  "getIndexes",
  "reIndex",
  "mapReduce",
  "stats",
  "dataSize",
  "storageSize",
  "totalIndexSize",
  "isCapped",
  "drop",
  "watch",
  "explain",
  "renameCollection",
]);

/** Cursor methods (chained after a query that returns a cursor). */
const CURSOR_METHODS = mkMethods([
  "sort",
  "limit",
  "skip",
  "project",
  "projection",
  "count",
  "size",
  "toArray",
  "forEach",
  "map",
  "hasNext",
  "next",
  "pretty",
  "batchSize",
  "hint",
  "max",
  "min",
  "comment",
  "collation",
  "allowDiskUse",
  "explain",
]);

/**
 * Context-aware autocomplete for the Mongo shell editor:
 *  - after `db.`            → collection names
 *  - after `db.<coll>.`     → collection methods
 *  - after `).`             → cursor methods
 *  - after `$`              → query operators
 *  - inside objects         → field names
 */
export function queryAutocomplete(collections: string[], fields: FieldSchema[]): Extension {
  const collCompletions: Completion[] = collections.map((c) => ({
    label: c,
    type: "class",
    detail: "collection",
    boost: 2,
  }));
  // Shell mode: bare keys, value snippets carrying the field's BSON type.
  const fieldNames: Completion[] = fields.map((f) => ({
    label: f.path,
    type: "property",
    detail: f.types.join(" | "),
  }));
  const fieldWithValue: Completion[] = fields.map((f) =>
    snippetCompletion(`${isIdent(f.path) ? f.path : JSON.stringify(f.path)}: ${valueSnippet(f.types)}`, {
      label: f.path,
      type: "property",
      detail: f.types.join(" | "),
    })
  );

  const source = (ctx: CompletionContext): CompletionResult | null => {
    // operators ($gt, $in, …)
    const dollar = ctx.matchBefore(/\$[\w$]*$/);
    if (dollar) return { from: dollar.from, options: OPERATORS, validFor: /^\$[\w$]*$/ };

    const word = ctx.matchBefore(/[\w$]*$/);
    const from = word ? word.from : ctx.pos;
    const before = ctx.state.sliceDoc(0, from);

    if (/\bdb\s*\.\s*[\w$]+\s*\.\s*$/.test(before))
      return { from, options: COLLECTION_METHODS, validFor: /^[\w$]*$/ };
    if (/\)\s*\.\s*$/.test(before))
      return { from, options: CURSOR_METHODS, validFor: /^[\w$]*$/ };
    if (/\bdb\s*\.\s*$/.test(before))
      return { from, options: collCompletions, validFor: /^[\w$]*$/ };

    // field names inside objects
    const fieldWord = ctx.matchBefore(/"?[\w.]*$/);
    if (!fieldWord || (fieldWord.from === fieldWord.to && !ctx.explicit)) return null;
    return {
      from: fieldWord.from,
      options: hasValueAhead(ctx) ? fieldNames : fieldWithValue,
      validFor: /^"?[\w.]*"?$/,
    };
  };

  return autocompletion({ override: [source], icons: false });
}

/** SQL keywords offered in the SQL query mode. */
const SQL_KEYWORDS: Completion[] = [
  "SELECT",
  "FROM",
  "WHERE",
  "AND",
  "OR",
  "ORDER BY",
  "ASC",
  "DESC",
  "LIMIT",
  "OFFSET",
  "LIKE",
  "IN",
  "COUNT(*)",
  "NOT",
  "NULL",
].map((label) => ({ label, type: "keyword", detail: "sql" }));

/**
 * Autocomplete for the SQL query mode: collection names after FROM, field names
 * after WHERE/AND/ORDER BY, SQL keywords otherwise.
 */
export function sqlAutocomplete(collections: string[], fields: FieldSchema[]): Extension {
  const collCompletions: Completion[] = collections.map((c) => ({
    label: c,
    type: "class",
    detail: "collection",
    boost: 2,
  }));
  const fieldCompletions: Completion[] = fields.map((f) => ({
    label: f.path,
    type: "property",
    detail: f.types.join(" | "),
  }));

  const source = (ctx: CompletionContext): CompletionResult | null => {
    const word = ctx.matchBefore(/[\w.*]*/);
    if (!word || (word.from === word.to && !ctx.explicit)) return null;
    const head = ctx.state.sliceDoc(0, word.from).toUpperCase();
    const lastKw = head.match(/\b(FROM|WHERE|AND|OR|BY|SELECT)\s*$/);
    let options: Completion[];
    if (lastKw && lastKw[1] === "FROM") options = collCompletions;
    else if (lastKw && (lastKw[1] === "WHERE" || lastKw[1] === "AND" || lastKw[1] === "OR" || lastKw[1] === "BY")) {
      options = [...fieldCompletions, ...SQL_KEYWORDS];
    } else if (lastKw && lastKw[1] === "SELECT") {
      options = [{ label: "*", type: "keyword" }, ...fieldCompletions];
    } else {
      options = [...SQL_KEYWORDS, ...fieldCompletions];
    }
    return { from: word.from, options, validFor: /^[\w.*]*$/ };
  };

  return autocompletion({ override: [source], icons: false });
}
