import { create } from "zustand";

export const useAiTerminal = create<{ open: boolean; show: () => void; close: () => void; toggle: () => void }>((set) => ({
  open: false,
  show: () => set({ open: true }),
  close: () => set({ open: false }),
  toggle: () => set((state) => ({ open: !state.open })),
}));
