import { create } from "zustand";
import { getCurrentWindow } from "@tauri-apps/api/window";

export type ThemeMode = "dark" | "light" | "system";

const KEY = "tucano-db:theme";
const initialMode = (localStorage.getItem(KEY) as ThemeMode) || "system";

type ThemeState = {
  mode: ThemeMode;
  systemDark: boolean;
  setMode: (m: ThemeMode) => void;
  toggle: () => void;
};

export const useTheme = create<ThemeState>((set, get) => ({
  mode: initialMode,
  systemDark: window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true,
  setMode(m) {
    localStorage.setItem(KEY, m);
    set({ mode: m });
  },
  toggle() {
    const order: ThemeMode[] = ["light", "dark", "system"];
    const i = order.indexOf(get().mode);
    get().setMode(order[(i + 1) % order.length]);
  },
}));

export const effectiveTheme = (): "dark" | "light" => {
  const { mode, systemDark } = useTheme.getState();
  if (mode === "system") return systemDark ? "dark" : "light";
  return mode;
};

if (window.matchMedia) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener?.("change", (e) => useTheme.setState({ systemDark: e.matches }));
}

// Side effects: toggle the `dark` class on <html> and keep the macOS native
// title bar in sync by repainting the window background. Matches the CSS body
// backgrounds in styles.css so there's no seam between OS chrome and the TopBar.
function applyTheme() {
  const { mode } = useTheme.getState();
  const dark = effectiveTheme() === "dark";
  document.documentElement.classList.toggle("dark", dark);
  const color = dark ? "#0F1014" : "#FFFFFF";
  try {
    const win = getCurrentWindow();
    win.setBackgroundColor(color).catch((e) => {
      console.warn("[theme] setBackgroundColor failed", e);
    });
    // In "system" mode pass null so the window keeps following the OS
    // appearance; forcing a concrete theme would flip prefers-color-scheme and
    // corrupt systemDark.
    win.setTheme(mode === "system" ? null : dark ? "dark" : "light").catch((e) => {
      console.warn("[theme] setTheme failed", e);
    });
  } catch (e) {
    void e; // Not running inside Tauri (plain web preview) — ignore.
  }
}

applyTheme();
useTheme.subscribe(applyTheme);

// Reactive effective theme for components (e.g. CodeMirror editors that must
// rebuild their theme extensions on light/dark switch).
export const useEffectiveTheme = (): "dark" | "light" =>
  useTheme((s) => (s.mode === "system" ? (s.systemDark ? "dark" : "light") : s.mode));

export const themeMode = (): ThemeMode => useTheme.getState().mode;
export const setTheme = (m: ThemeMode) => useTheme.getState().setMode(m);
export const toggleTheme = () => useTheme.getState().toggle();
