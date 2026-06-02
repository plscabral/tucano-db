import { create } from "zustand";

export type DocEditMode = "edit" | "insert" | "duplicate";

type State = {
  editor: { mode: DocEditMode; json: string } | null;
  deleting: { idJson: string; label: string } | null;
  openEditor: (mode: DocEditMode, json: string) => void;
  closeEditor: () => void;
  openDelete: (idJson: string, label: string) => void;
  closeDelete: () => void;
};

/** Drives the document editor dialog and the delete confirmation. */
export const useDocActions = create<State>((set) => ({
  editor: null,
  deleting: null,
  openEditor: (mode, json) => set({ editor: { mode, json } }),
  closeEditor: () => set({ editor: null }),
  openDelete: (idJson, label) => set({ deleting: { idJson, label } }),
  closeDelete: () => set({ deleting: null }),
}));

/** Pretty-print a single doc (canonical Extended JSON) for the editor. */
export function prettyDoc(doc: Record<string, unknown>): string {
  return JSON.stringify(doc, null, 2);
}

/** A short human label for a document (its _id rendered compactly). */
export function docLabel(doc: Record<string, unknown>): string {
  const id = doc._id as Record<string, unknown> | string | undefined;
  if (id && typeof id === "object" && "$oid" in id) return String(id.$oid);
  return id !== undefined ? JSON.stringify(id) : "(no _id)";
}
