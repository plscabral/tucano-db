#!/usr/bin/env node
// MCP server that exposes a running Tucano DB instance to MCP clients.
// It forwards tool calls to the app's local HTTP bridge (see src-tauri/mcp_bridge.rs).

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const BRIDGE = process.env.TUCANO_DB_BRIDGE || "http://127.0.0.1:7900";
const TOKEN = process.env.TUCANO_DB_TOKEN || "";

async function bridge(path, params = {}) {
  const url = new URL(path, BRIDGE);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, { headers: { authorization: `Bearer ${TOKEN}` } });
  if (!res.ok) throw new Error(`bridge ${res.status}: ${await res.text()}`);
  return res.json();
}

const TOOLS = [
  {
    name: "list_connections",
    description: "List saved Tucano DB connections and whether each is currently active.",
    inputSchema: { type: "object", properties: {} },
    handler: () => bridge("/connections"),
  },
  {
    name: "list_databases",
    description: "List databases for an active connection.",
    inputSchema: {
      type: "object",
      properties: { conn: { type: "string", description: "connection id" } },
      required: ["conn"],
    },
    handler: (a) => bridge("/databases", a),
  },
  {
    name: "list_collections",
    description: "List collections in a database.",
    inputSchema: {
      type: "object",
      properties: { conn: { type: "string" }, db: { type: "string" } },
      required: ["conn", "db"],
    },
    handler: (a) => bridge("/collections", a),
  },
  {
    name: "find",
    description: "Find documents in a collection (read-only). filter is a JSON string.",
    inputSchema: {
      type: "object",
      properties: {
        conn: { type: "string" },
        db: { type: "string" },
        coll: { type: "string" },
        filter: { type: "string", description: "MongoDB filter as JSON" },
        limit: { type: "number" },
      },
      required: ["conn", "db", "coll"],
    },
    handler: (a) => bridge("/find", a),
  },
  {
    name: "aggregate",
    description: "Run a read-only MongoDB aggregation pipeline. pipeline is a JSON array.",
    inputSchema: { type: "object", properties: { conn: { type: "string" }, db: { type: "string" }, coll: { type: "string" }, pipeline: { type: "string" }, limit: { type: "number" } }, required: ["conn", "db", "coll", "pipeline"] },
    handler: (a) => bridge("/aggregate", a),
  },
  {
    name: "list_indexes",
    description: "List indexes for a collection.",
    inputSchema: { type: "object", properties: { conn: { type: "string" }, db: { type: "string" }, coll: { type: "string" } }, required: ["conn", "db", "coll"] },
    handler: (a) => bridge("/indexes", a),
  },
  {
    name: "analyze_schema",
    description: "Analyze sampled documents and indexes for a collection. Returns field types, coverage, representative values, and index coverage. Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        conn: { type: "string" },
        db: { type: "string" },
        coll: { type: "string" },
        sample: { type: "number", description: "documents to sample, from 1 to 500; defaults to 100" },
      },
      required: ["conn", "db", "coll"],
    },
    handler: (a) => bridge("/schema", a),
  },
  {
    name: "explain",
    description: "Return MongoDB execution statistics for a read-only find filter.",
    inputSchema: { type: "object", properties: { conn: { type: "string" }, db: { type: "string" }, coll: { type: "string" }, filter: { type: "string" } }, required: ["conn", "db", "coll"] },
    handler: (a) => bridge("/explain", a),
  },
  {
    name: "overview",
    description: "Get serverStatus analytics for a connection.",
    inputSchema: {
      type: "object",
      properties: { conn: { type: "string" } },
      required: ["conn"],
    },
    handler: (a) => bridge("/overview", a),
  },
];

const server = new Server(
  { name: "tucano-db", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = TOOLS.find((t) => t.name === req.params.name);
  if (!tool) throw new Error(`unknown tool: ${req.params.name}`);
  try {
    const result = await tool.handler(req.params.arguments || {});
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (e) {
    return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
