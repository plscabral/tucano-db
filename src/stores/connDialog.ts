import { create } from "zustand";
import type { Connection } from "@/lib/types";

type State = {
  isOpen: boolean;
  editing: Connection | null;
  openNew: () => void;
  openEdit: (c: Connection) => void;
  close: () => void;
};

/** Global driver for the add/edit connection dialog (used by the start screen and the sidebar). */
export const useConnDialog = create<State>((set) => ({
  isOpen: false,
  editing: null,
  openNew: () => set({ isOpen: true, editing: null }),
  openEdit: (editing) => set({ isOpen: true, editing }),
  close: () => set({ isOpen: false, editing: null }),
}));
