import { create } from "zustand";
import { ipc } from "@/lib/ipc";
import { parse, defaultQueryFor, type QueryLang } from "@/lib/queryParser";
import { useQueryLog } from "@/stores/queryLog";
import type { ConnColor, FindResult, ViewMode } from "@/lib/types";

export type GridSort = { field: string; dir: 1 | -1 };

let seq = 0;
const nextId = () => `tab-${++seq}`;

// Remember the last-chosen view mode so new tabs/collections open the same way.
const VIEW_KEY = "tucano-db:viewMode";
const loadViewMode = (): ViewMode =>
  (localStorage.getItem(VIEW_KEY) as ViewMode) || "tree";
const saveViewMode = (m: ViewMode) => localStorage.setItem(VIEW_KEY, m);

export type Tab = {
  id: string;
  connId: string;
  connName: string;
  connColor: ConnColor;
  db: string;
  coll: string | null;
  lang: QueryLang;
  query: string;
  viewMode: ViewMode;
  page: number;
  pageSize: number;
  result: FindResult | null;
  loading: boolean;
  error: string | null;
  isAggregate: boolean;
  history: string[];
  gridSort: GridSort | null;
  /** Has an unsaved query (clears when saved). */
  dirty: boolean;
};

type Ctx = { connId: string; connName: string; connColor: ConnColor; db: string };

type TabsState = {
  tabs: Tab[];
  activeId: string | null;
  defaultPageSize: number;
  autoExecute: boolean;
  initialScript: string;

  setDefaultPageSize: (n: number) => void;
  setAutoExecute: (v: boolean) => void;
  setInitialScript: (s: string) => void;
  setActive: (id: string) => void;
  closeTab: (id: string) => void;
  closeOthers: (id: string) => void;
  closeAll: () => void;
  closeRight: (id: string) => void;
  duplicateTab: (id: string) => void;
  closeForServer: (connId: string) => void;
  newTab: (ctx: Ctx, coll?: string) => string;
  openCollection: (ctx: Ctx, coll: string) => void;
  update: (id: string, patch: Partial<Tab>) => void;
  setPage: (id: string, page: number) => void;
  setPageSize: (id: string, n: number) => void;
  setLang: (id: string, lang: QueryLang) => void;
  setViewMode: (id: string, mode: ViewMode) => void;
  setGridSort: (id: string, field: string) => void;
  applyQuery: (query: string, lang?: QueryLang) => void;
  openQuery: (ctx: Ctx, coll: string | null, query: string, lang: QueryLang) => void;
  markSaved: (id: string) => void;
  run: (id: string) => Promise<void>;
};

export const useTabs = create<TabsState>((set, get) => ({
  tabs: [],
  activeId: null,
  defaultPageSize: 50,
  autoExecute: true,
  initialScript: "",

  setDefaultPageSize: (defaultPageSize) => set({ defaultPageSize }),
  setAutoExecute: (autoExecute) => set({ autoExecute }),
  setInitialScript: (initialScript) => set({ initialScript }),
  setActive: (activeId) => set({ activeId }),

  closeTab(id) {
    const tabs = get().tabs.filter((t) => t.id !== id);
    let activeId = get().activeId;
    if (activeId === id) activeId = tabs[tabs.length - 1]?.id ?? null;
    set({ tabs, activeId });
  },

  closeOthers(id) {
    const keep = get().tabs.find((t) => t.id === id);
    set({ tabs: keep ? [keep] : [], activeId: keep ? id : null });
  },

  closeAll() {
    set({ tabs: [], activeId: null });
  },

  closeRight(id) {
    const idx = get().tabs.findIndex((t) => t.id === id);
    if (idx === -1) return;
    const tabs = get().tabs.slice(0, idx + 1);
    let activeId = get().activeId;
    if (!tabs.find((t) => t.id === activeId)) activeId = id;
    set({ tabs, activeId });
  },

  duplicateTab(id) {
    const src = get().tabs.find((t) => t.id === id);
    if (!src) return;
    const newId = nextId();
    const clone: Tab = { ...src, id: newId, result: null, loading: false, error: null, dirty: true };
    const idx = get().tabs.findIndex((t) => t.id === id);
    const tabs = [...get().tabs];
    tabs.splice(idx + 1, 0, clone);
    set({ tabs, activeId: newId });
    get().run(newId);
  },

  closeForServer(connId) {
    const tabs = get().tabs.filter((t) => t.connId !== connId);
    let activeId = get().activeId;
    if (!tabs.find((t) => t.id === activeId)) activeId = tabs[tabs.length - 1]?.id ?? null;
    set({ tabs, activeId });
  },

  newTab(ctx, coll) {
    const id = nextId();
    const template = get().initialScript.trim();
    const query = coll
      ? template
        ? template.replace(/\{coll\}/g, coll)
        : defaultQueryFor("mongo", coll)
      : "db.";
    const tab: Tab = {
      id,
      connId: ctx.connId,
      connName: ctx.connName,
      connColor: ctx.connColor,
      db: ctx.db,
      coll: coll ?? null,
      lang: "mongo",
      query,
      viewMode: loadViewMode(),
      page: 1,
      pageSize: get().defaultPageSize,
      result: null,
      loading: false,
      error: null,
      isAggregate: false,
      history: [],
      gridSort: null,
      dirty: true,
    };
    set({ tabs: [...get().tabs, tab], activeId: id });
    if (coll && get().autoExecute) get().run(id);
    return id;
  },

  openCollection(ctx, coll) {
    const existing = get().tabs.find(
      (t) => t.connId === ctx.connId && t.db === ctx.db && t.coll === coll
    );
    if (existing) {
      set({ activeId: existing.id });
      return;
    }
    get().newTab(ctx, coll);
  },

  update(id, patch) {
    // Editing the query marks the tab dirty (unless dirty is set explicitly).
    const dirtyPatch = "query" in patch && !("dirty" in patch) ? { dirty: true } : {};
    set({ tabs: get().tabs.map((t) => (t.id === id ? { ...t, ...patch, ...dirtyPatch } : t)) });
  },

  markSaved(id) {
    set({ tabs: get().tabs.map((t) => (t.id === id ? { ...t, dirty: false } : t)) });
  },

  setPage(id, page) {
    get().update(id, { page: Math.max(1, page) });
    get().run(id);
  },

  setPageSize(id, n) {
    get().update(id, { pageSize: Math.max(1, n), page: 1 });
    get().run(id);
  },

  setViewMode(id, mode) {
    saveViewMode(mode);
    get().update(id, { viewMode: mode });
  },

  applyQuery(query, lang) {
    const id = get().activeId;
    if (id) get().update(id, { query, ...(lang ? { lang } : {}) });
  },

  // Open a saved/historical query in its collection — focusing an existing tab
  // or creating one — then run it. Works even with no query editor open.
  openQuery(ctx, coll, query, lang) {
    const existing = get().tabs.find(
      (t) => t.connId === ctx.connId && t.db === ctx.db && t.coll === coll
    );
    if (existing) {
      get().update(existing.id, { query, lang, page: 1 });
      set({ activeId: existing.id });
      get().run(existing.id);
      return;
    }
    const id = nextId();
    const tab: Tab = {
      id,
      connId: ctx.connId,
      connName: ctx.connName,
      connColor: ctx.connColor,
      db: ctx.db,
      coll,
      lang,
      query,
      viewMode: loadViewMode(),
      page: 1,
      pageSize: get().defaultPageSize,
      result: null,
      loading: false,
      error: null,
      isAggregate: false,
      history: [],
      gridSort: null,
      dirty: true,
    };
    set({ tabs: [...get().tabs, tab], activeId: id });
    get().run(id);
  },

  setLang(id, lang) {
    const tab = get().tabs.find((t) => t.id === id);
    if (!tab) return;
    // Swap to a sensible default query for the new language (keeps the coll).
    const query = tab.coll ? defaultQueryFor(lang, tab.coll) : lang === "sql" ? "SELECT * FROM " : "db.";
    get().update(id, { lang, query, error: null });
  },

  setGridSort(id, field) {
    const tab = get().tabs.find((t) => t.id === id);
    if (!tab) return;
    // Cycle: asc → desc → off.
    let next: GridSort | null;
    if (!tab.gridSort || tab.gridSort.field !== field) next = { field, dir: 1 };
    else if (tab.gridSort.dir === 1) next = { field, dir: -1 };
    else next = null;
    get().update(id, { gridSort: next, page: 1 });
    get().run(id);
  },

  async run(id) {
    const tab = get().tabs.find((t) => t.id === id);
    if (!tab) return;

    let parsed;
    try {
      parsed = parse(tab.lang, tab.query);
    } catch (e) {
      get().update(id, { error: String(e), loading: false });
      return;
    }

    const history = tab.history[0] === tab.query ? tab.history : [tab.query, ...tab.history].slice(0, 30);
    get().update(id, { loading: true, error: null, coll: parsed.coll, history });
    // Record into the per-database query log.
    useQueryLog.getState().add({
      connId: tab.connId,
      connName: tab.connName,
      db: tab.db,
      coll: parsed.coll,
      lang: tab.lang,
      query: tab.query,
    });

    try {
      if (parsed.kind === "find") {
        const pageSize = parsed.limit ?? tab.pageSize;
        // A grid-header sort overrides the query's own sort.
        const sort = tab.gridSort
          ? JSON.stringify({ [tab.gridSort.field]: tab.gridSort.dir })
          : parsed.sort;
        const result = await ipc.findDocuments({
          connId: tab.connId,
          db: tab.db,
          coll: parsed.coll,
          filter: parsed.filter || "{}",
          sort,
          projection: parsed.projection,
          page: tab.page,
          pageSize,
          skip: parsed.skip ?? 0,
        });
        get().update(id, { result, pageSize, isAggregate: false, loading: false });
      } else if (parsed.kind === "aggregate") {
        const limit = parsed.limit ?? 200;
        const started = performance.now();
        const docs = await ipc.aggregate({
          connId: tab.connId,
          db: tab.db,
          coll: parsed.coll,
          pipeline: parsed.pipeline,
          limit,
        });
        get().update(id, {
          result: {
            docs,
            filteredCount: docs.length,
            totalCount: docs.length,
            page: 1,
            pageSize: docs.length || 1,
            elapsedMs: Math.round(performance.now() - started),
          },
          isAggregate: true,
          loading: false,
        });
      } else {
        // count → reuse find's filteredCount
        const res = await ipc.findDocuments({
          connId: tab.connId,
          db: tab.db,
          coll: parsed.coll,
          filter: parsed.filter || "{}",
          sort: "",
          projection: "",
          page: 1,
          pageSize: 1,
          skip: 0,
        });
        get().update(id, {
          result: {
            docs: [{ count: res.filteredCount }],
            filteredCount: 1,
            totalCount: res.totalCount,
            page: 1,
            pageSize: 1,
            elapsedMs: res.elapsedMs,
          },
          isAggregate: true,
          loading: false,
        });
      }
    } catch (e) {
      get().update(id, { loading: false, error: String(e) });
    }
  },
}));

/** Hook returning the currently active tab (or null). */
export const useActiveTab = (): Tab | null =>
  useTabs((s) => s.tabs.find((t) => t.id === s.activeId) ?? null);
