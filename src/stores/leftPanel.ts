import { create } from "zustand";

export type LeftView = "tree" | "saved" | "history";

const KEY = "tucano-db:leftView";

type State = {
  view: LeftView;
  setView: (v: LeftView) => void;
};

/** Which panel the left activity rail is showing (Beekeeper-style). */
export const useLeftPanel = create<State>((set) => ({
  view: (localStorage.getItem(KEY) as LeftView) || "tree",
  setView: (view) => {
    localStorage.setItem(KEY, view);
    set({ view });
  },
}));
