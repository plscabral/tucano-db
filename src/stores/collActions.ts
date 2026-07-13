import { create } from "zustand";

export type ActionKind =
  | "renameColl"
  | "duplicateColl"
  | "dropColl"
  | "createColl"
  | "dropDb"
  | "createDb"
  | "indexes"
  | "schema"
  | "history";

export type CollAction = {
  kind: ActionKind;
  connId: string;
  db?: string;
  coll?: string;
};

type State = {
  action: CollAction | null;
  open: (a: CollAction) => void;
  close: () => void;
};

/** Drives the collection/database action dialogs from sidebar context menus. */
export const useCollActions = create<State>((set) => ({
  action: null,
  open: (action) => set({ action }),
  close: () => set({ action: null }),
}));
