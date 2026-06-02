import { create } from "zustand";
import { ipc } from "@/lib/ipc";
import type { CollectionInfo, DatabaseInfo } from "@/lib/types";

export type Route = "connections" | "browse" | "overview";

export type ServerTree = {
  databases: DatabaseInfo[];
  collections: Record<string, CollectionInfo[]>; // keyed by db name
  /** Backup-history entry counts per db → collection. */
  backups: Record<string, Record<string, number>>;
  expandedDbs: Set<string>;
  loading: boolean;
};

const emptyTree = (): ServerTree => ({
  databases: [],
  collections: {},
  backups: {},
  expandedDbs: new Set(),
  loading: false,
});

type TreeState = {
  route: Route;
  /** Connected servers shown in the sidebar (ordered). */
  open: string[];
  trees: Record<string, ServerTree>;
  expandedConns: Set<string>;
  /** Server the Overview screen targets. */
  focusedConn: string | null;

  setRoute: (r: Route) => void;
  setFocused: (connId: string) => void;
  addServer: (connId: string) => Promise<void>;
  removeServer: (connId: string) => void;
  toggleConn: (connId: string) => void;
  toggleDb: (connId: string, db: string) => Promise<void>;
  loadDatabases: (connId: string) => Promise<void>;
  loadCollections: (connId: string, db: string) => Promise<void>;
  refreshServer: (connId: string) => Promise<void>;
};

function patchTree(get: () => TreeState, set: (p: Partial<TreeState>) => void, connId: string, patch: Partial<ServerTree>) {
  const trees = get().trees;
  set({ trees: { ...trees, [connId]: { ...(trees[connId] ?? emptyTree()), ...patch } } });
}

export const useTree = create<TreeState>((set, get) => ({
  route: "connections",
  open: [],
  trees: {},
  expandedConns: new Set(),
  focusedConn: null,

  setRoute: (route) => set({ route }),
  setFocused: (focusedConn) => set({ focusedConn }),

  async addServer(connId) {
    const open = get().open.includes(connId) ? get().open : [...get().open, connId];
    const expanded = new Set(get().expandedConns);
    expanded.add(connId);
    set({
      open,
      expandedConns: expanded,
      focusedConn: connId,
      route: "browse",
      trees: { ...get().trees, [connId]: get().trees[connId] ?? emptyTree() },
    });
    await get().loadDatabases(connId);
  },

  removeServer(connId) {
    const open = get().open.filter((id) => id !== connId);
    const trees = { ...get().trees };
    delete trees[connId];
    const expanded = new Set(get().expandedConns);
    expanded.delete(connId);
    set({
      open,
      trees,
      expandedConns: expanded,
      focusedConn: get().focusedConn === connId ? open[0] ?? null : get().focusedConn,
    });
  },

  toggleConn(connId) {
    const expanded = new Set(get().expandedConns);
    if (expanded.has(connId)) expanded.delete(connId);
    else expanded.add(connId);
    set({ expandedConns: expanded });
  },

  async loadDatabases(connId) {
    patchTree(get, set, connId, { loading: true });
    try {
      const databases = await ipc.listDatabases(connId);
      patchTree(get, set, connId, { databases, loading: false });
    } catch {
      patchTree(get, set, connId, { loading: false });
    }
  },

  async loadCollections(connId, db) {
    const [cols, backupColls] = await Promise.all([
      ipc.listCollections(connId, db),
      ipc.historyCollections(connId, db).catch(() => [] as { coll: string; count: number }[]),
    ]);
    const counts: Record<string, number> = {};
    for (const b of backupColls) counts[b.coll] = b.count;
    const tree = get().trees[connId] ?? emptyTree();
    patchTree(get, set, connId, {
      collections: { ...tree.collections, [db]: cols },
      backups: { ...tree.backups, [db]: counts },
    });
  },

  async toggleDb(connId, db) {
    const tree = get().trees[connId] ?? emptyTree();
    const expanded = new Set(tree.expandedDbs);
    if (expanded.has(db)) {
      expanded.delete(db);
      patchTree(get, set, connId, { expandedDbs: expanded });
    } else {
      expanded.add(db);
      patchTree(get, set, connId, { expandedDbs: expanded });
      if (!tree.collections[db]) await get().loadCollections(connId, db);
    }
  },

  async refreshServer(connId) {
    await get().loadDatabases(connId);
    const tree = get().trees[connId];
    if (tree) {
      for (const db of tree.expandedDbs) await get().loadCollections(connId, db);
    }
  },
}));
