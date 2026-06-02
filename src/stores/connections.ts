import { create } from "zustand";
import { ipc } from "@/lib/ipc";
import type { ConnColor, Connection } from "@/lib/types";

type ConnState = {
  list: Connection[];
  active: Set<string>;
  busyId: string | null;
  error: string | null;
  load: () => Promise<void>;
  add: (name: string, uri: string, color: ConnColor) => Promise<Connection>;
  update: (id: string, name: string, uri: string, color: ConnColor) => Promise<void>;
  setVisibleDbs: (id: string, dbs: string[]) => Promise<void>;
  remove: (id: string) => Promise<void>;
  connect: (id: string) => Promise<boolean>;
  disconnect: (id: string) => Promise<void>;
};

export const useConnections = create<ConnState>((set, get) => ({
  list: [],
  active: new Set(),
  busyId: null,
  error: null,

  async load() {
    const [list, active] = await Promise.all([
      ipc.listConnections(),
      ipc.activeConnections(),
    ]);
    set({ list, active: new Set(active) });
  },

  async add(name, uri, color) {
    const conn = await ipc.addConnection(name, uri, color);
    set({ list: [...get().list, conn] });
    return conn;
  },

  async update(id, name, uri, color) {
    const updated = await ipc.updateConnection(id, name, uri, color);
    set({ list: get().list.map((c) => (c.id === id ? updated : c)) });
  },

  async setVisibleDbs(id, dbs) {
    await ipc.setVisibleDatabases(id, dbs);
    set({
      list: get().list.map((c) => (c.id === id ? { ...c, visibleDbs: dbs } : c)),
    });
  },

  async remove(id) {
    await ipc.removeConnection(id);
    const active = new Set(get().active);
    active.delete(id);
    set({ list: get().list.filter((c) => c.id !== id), active });
  },

  async connect(id) {
    set({ busyId: id, error: null });
    try {
      await ipc.connect(id);
      const active = new Set(get().active);
      active.add(id);
      set({ active, busyId: null });
      // refresh lastConnected
      get().load();
      return true;
    } catch (e) {
      set({ busyId: null, error: String(e) });
      return false;
    }
  },

  async disconnect(id) {
    await ipc.disconnect(id);
    const active = new Set(get().active);
    active.delete(id);
    set({ active });
  },
}));
