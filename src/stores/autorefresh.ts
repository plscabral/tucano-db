import { create } from "zustand";

const KEY = "tucano-db:autorefresh";

type Persisted = { enabled: boolean; intervalMs: number };

function load(): Persisted {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return { enabled: false, intervalMs: 5000 };
}

type AutoRefreshState = Persisted & {
  setEnabled: (on: boolean) => void;
  setIntervalMs: (ms: number) => void;
};

export const useAutoRefresh = create<AutoRefreshState>((set, get) => ({
  ...load(),
  setEnabled(enabled) {
    set({ enabled });
    localStorage.setItem(KEY, JSON.stringify({ enabled, intervalMs: get().intervalMs }));
  },
  setIntervalMs(intervalMs) {
    set({ intervalMs });
    localStorage.setItem(KEY, JSON.stringify({ enabled: get().enabled, intervalMs }));
  },
}));

/** Common auto-refresh interval presets (ms). */
export const REFRESH_PRESETS: { label: string; ms: number }[] = [
  { label: "2s", ms: 2000 },
  { label: "5s", ms: 5000 },
  { label: "10s", ms: 10000 },
  { label: "30s", ms: 30000 },
  { label: "1m", ms: 60000 },
];
