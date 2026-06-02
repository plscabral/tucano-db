import { useEffect, useRef } from "react";
import { EditorState, Prec, type Extension } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { json } from "@codemirror/lang-json";
import { syntaxHighlighting } from "@codemirror/language";
import { tucanoHighlightDark, tucanoHighlightLight } from "@/lib/cmTheme";
import { useEffectiveTheme } from "@/stores/theme";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  extensions?: Extension[];
  /** Language support extension. Defaults to JSON. */
  language?: Extension;
  minHeight?: number;
  className?: string;
};

/**
 * Reusable CodeMirror JSON editor. Controlled via `value`; emits `onChange`.
 * Used by the document editor and the JSON document view.
 */
export function RawEditor({
  value,
  onChange,
  readOnly = false,
  extensions = [],
  language,
  minHeight = 160,
  className,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const dark = useEffectiveTheme() === "dark";

  // Recreate the editor on theme / readOnly / extension changes.
  useEffect(() => {
    if (!ref.current) return;

    const base: Extension[] = [
      lineNumbers(),
      history(),
      language ?? json(),
      // Highest precedence so our vibrant palette wins over the base theme.
      Prec.highest(syntaxHighlighting(dark ? tucanoHighlightDark : tucanoHighlightLight, { fallback: true })),
      highlightActiveLine(),
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
      EditorView.theme({
        "&": { fontSize: "12.5px", height: "100%" },
        ".cm-content": { fontFamily: "'JetBrains Mono', ui-monospace, monospace" },
        ".cm-gutters": { background: "transparent", border: "none" },
        "&.cm-focused": { outline: "none" },
      }),
      EditorView.editable.of(!readOnly),
      EditorState.readOnly.of(readOnly),
      // Dark chrome: transparent background (so our near-black canvas shows),
      // light default text and teal cursor/selection. Token colors come from
      // tucanoHighlightDark. (We avoid oneDark — its grey bg clashed.)
      ...(dark
        ? [
            EditorView.theme(
              {
                "&": { backgroundColor: "transparent", color: "#cdd6e3" },
                ".cm-gutters": {
                  backgroundColor: "transparent",
                  color: "rgba(255,255,255,0.28)",
                  border: "none",
                },
                ".cm-activeLine": { backgroundColor: "rgba(255,255,255,0.04)" },
                ".cm-activeLineGutter": { backgroundColor: "transparent", color: "rgba(255,255,255,0.55)" },
                ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#2ec4d6" },
                "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
                  backgroundColor: "rgba(46,196,214,0.28)",
                },
              },
              { dark: true }
            ),
          ]
        : []),
      ...extensions,
    ];

    if (onChange) {
      base.push(
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChange(u.state.doc.toString());
        })
      );
    }

    const view = new EditorView({
      state: EditorState.create({ doc: value, extensions: base }),
      parent: ref.current,
    });
    viewRef.current = view;
    return () => view.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dark, readOnly, extensions, language]);

  // Sync external value changes without losing cursor on local edits.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div
      ref={ref}
      className={cn("scroll-thin overflow-auto rounded-md border border-border bg-card", className)}
      style={{ minHeight }}
    />
  );
}
