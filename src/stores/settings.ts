import { create } from "zustand";
import { ipc } from "@/lib/ipc";
import { useI18n } from "@/lib/i18n";
import type { AppSettings } from "@/lib/types";

const DEFAULTS: AppSettings = {
  language: "en",
  timezone: "local",
  dateMode: "iso",
  dateFormat: "YYYY-MM-DD HH:mm:ss",
  defaultPageSize: 50,
  exportFormat: "json",
  autoExecute: true,
  initialScript: "",
  recordUpdates: true,
  recordInserts: true,
  recordDeletes: true,
};

type SettingsState = {
  settings: AppSettings;
  loaded: boolean;
  load: () => Promise<void>;
  update: (patch: Partial<AppSettings>) => Promise<void>;
};

export const useSettings = create<SettingsState>((set, get) => ({
  settings: DEFAULTS,
  loaded: false,
  async load() {
    try {
      const s = await ipc.getSettings();
      set({ settings: s, loaded: true });
      useI18n.getState().setLang(s.language);
    } catch {
      set({ loaded: true });
    }
  },
  async update(patch) {
    const next = { ...get().settings, ...patch };
    set({ settings: next });
    if (patch.language) useI18n.getState().setLang(patch.language);
    try {
      await ipc.setSettings(next);
    } catch {
      /* ignore — best effort persistence */
    }
  },
}));
