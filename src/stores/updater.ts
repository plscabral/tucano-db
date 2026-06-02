import { create } from "zustand";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export type UpdaterState =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "ready"
  | "upToDate"
  | "error";

let pendingUpdate: Update | null = null;

type UpdaterStore = {
  state: UpdaterState;
  version: string | null;
  notes: string | null;
  progress: number;
  error: string | null;
  check: () => Promise<void>;
  download: () => Promise<void>;
  restart: () => Promise<void>;
};

export const useUpdater = create<UpdaterStore>((set, get) => ({
  state: "idle",
  version: null,
  notes: null,
  progress: 0,
  error: null,

  async check() {
    if (get().state === "checking" || get().state === "downloading") return;
    set({ state: "checking", error: null });
    try {
      const update = await check();
      if (update) {
        pendingUpdate = update;
        set({ version: update.version, notes: update.body ?? null, state: "available" });
      } else {
        pendingUpdate = null;
        set({ state: "upToDate" });
      }
    } catch (e) {
      set({ error: String(e), state: "error" });
    }
  },

  async download() {
    if (!pendingUpdate) return;
    set({ state: "downloading", progress: 0 });
    let total = 0;
    let downloaded = 0;
    try {
      await pendingUpdate.download((event) => {
        if (event.event === "Started") total = event.data.contentLength ?? 0;
        else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          set({ progress: total > 0 ? downloaded / total : 0 });
        }
      });
      set({ state: "ready" });
    } catch (e) {
      set({ error: String(e), state: "error" });
    }
  },

  async restart() {
    try {
      if (pendingUpdate) await pendingUpdate.install();
      await relaunch();
    } catch (e) {
      set({ error: String(e), state: "error" });
    }
  },
}));
