import { create } from "zustand";
import type { QueryLang } from "@/lib/queryParser";

const KEY = "tucano-db:savedQueries";

export type SavedQuery = {
  id: string;
  name: string;
  lang: QueryLang;
  query: string;
  connId: string | null;
  db: string | null;
  coll: string | null;
  ts: number;
};

function load(): SavedQuery[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

let counter = 0;

type State = {
  list: SavedQuery[];
  save: (q: Omit<SavedQuery, "id" | "ts">) => void;
  remove: (id: string) => void;
};

export const useSavedQueries = create<State>((set, get) => ({
  list: load(),
  save(q) {
    const item: SavedQuery = { ...q, id: `s${Date.now()}-${counter++}`, ts: Date.now() };
    const list = [item, ...get().list];
    set({ list });
    localStorage.setItem(KEY, JSON.stringify(list));
  },
  remove(id) {
    const list = get().list.filter((s) => s.id !== id);
    set({ list });
    localStorage.setItem(KEY, JSON.stringify(list));
  },
}));
