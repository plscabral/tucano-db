import { create } from "zustand";
import type { QueryLang } from "@/lib/queryParser";

const KEY = "tucano-db:queryLog";
const MAX = 500;

export type LogEntry = {
  id: string;
  connId: string;
  connName: string;
  db: string;
  coll: string;
  lang: QueryLang;
  query: string;
  ts: number;
};

function load(): LogEntry[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

let counter = 0;

type State = {
  entries: LogEntry[];
  add: (e: Omit<LogEntry, "id" | "ts">) => void;
  remove: (ids: string[]) => void;
  clear: (connId?: string, db?: string) => void;
};

export const useQueryLog = create<State>((set, get) => ({
  entries: load(),
  add(e) {
    const entry: LogEntry = { ...e, id: `q${Date.now()}-${counter++}`, ts: Date.now() };
    const entries = [entry, ...get().entries].slice(0, MAX);
    set({ entries });
    localStorage.setItem(KEY, JSON.stringify(entries));
  },
  remove(ids) {
    const drop = new Set(ids);
    const entries = get().entries.filter((e) => !drop.has(e.id));
    set({ entries });
    localStorage.setItem(KEY, JSON.stringify(entries));
  },
  clear(connId, db) {
    const entries =
      connId && db
        ? get().entries.filter((e) => !(e.connId === connId && e.db === db))
        : [];
    set({ entries });
    localStorage.setItem(KEY, JSON.stringify(entries));
  },
}));
