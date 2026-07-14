import { create } from "zustand";

type Preview = { path: string; html: string } | null;

type HtmlPreviewState = {
  preview: Preview;
  open: (path: string, html: string) => void;
  close: () => void;
};

/** Global because a field context menu can open the preview after it closes. */
export const useHtmlPreview = create<HtmlPreviewState>((set) => ({
  preview: null,
  open: (path, html) => set({ preview: { path, html } }),
  close: () => set({ preview: null }),
}));
