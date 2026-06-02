import { useEffect, useMemo, useState } from "react";
import { keymap } from "@codemirror/view";
import { Prec } from "@codemirror/state";
import { javascript } from "@codemirror/lang-javascript";
import { sql } from "@codemirror/lang-sql";
import { Loader2, Play, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RawEditor } from "@/viewers/RawEditor";
import { queryAutocomplete, sqlAutocomplete } from "@/lib/autocomplete";
import { ipc } from "@/lib/ipc";
import { useTabs, type Tab } from "@/stores/tabs";
import { useTree } from "@/stores/tree";
import { useSaveDialog } from "@/components/SaveQueryDialog";
import type { FieldSchema } from "@/lib/types";
import type { QueryLang } from "@/lib/queryParser";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function QueryEditor({ tab }: { tab: Tab }) {
  const t = useT();
  const update = useTabs((s) => s.update);
  const setLang = useTabs((s) => s.setLang);
  const run = useTabs((s) => s.run);
  const trees = useTree((s) => s.trees);
  const openSave = useSaveDialog((s) => s.open);

  const [fields, setFields] = useState<FieldSchema[]>([]);

  const collections = useMemo(() => {
    const tree = trees[tab.connId];
    return tree ? Object.values(tree.collections).flat().map((c) => c.name) : [];
  }, [trees, tab.connId]);

  useEffect(() => {
    if (!tab.coll) return;
    let cancelled = false;
    ipc
      .sampleFields(tab.connId, tab.db, tab.coll, 50)
      .then((f) => !cancelled && setFields(f))
      .catch(() => setFields([]));
    return () => {
      cancelled = true;
    };
  }, [tab.connId, tab.db, tab.coll]);

  const exec = () => run(tab.id);

  // Memoize so the editor isn't rebuilt on every keystroke (caused freezing).
  const language = useMemo(() => (tab.lang === "sql" ? sql() : javascript()), [tab.lang]);

  const extensions = useMemo(
    () => [
      tab.lang === "sql" ? sqlAutocomplete(collections, fields) : queryAutocomplete(collections, fields),
      // Highest precedence so ⌘↵ wins over the default editor keymap.
      Prec.highest(keymap.of([{ key: "Mod-Enter", run: () => (exec(), true) }])),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tab.lang, collections.join(","), fields]
  );

  const doSave = () => openSave(tab.id);

  const LangTab = ({ value, label }: { value: QueryLang; label: string }) => (
    <button
      onClick={() => value !== tab.lang && setLang(tab.id, value)}
      className={cn(
        "h-6 rounded px-2 text-[11px] font-medium transition",
        tab.lang === value ? "tcn-accent-soft text-tucano-700 dark:text-tucano-300" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="flex h-full w-full flex-col bg-card">
      {/* mode toggle + run row */}
      <div className="flex shrink-0 items-center gap-2 px-3 pt-2">
        <div className="flex items-center rounded-md border border-border p-0.5">
          <LangTab value="mongo" label="Mongo" />
          <LangTab value="sql" label="SQL" />
        </div>
        <span className="mono text-[10px] uppercase tracking-wider text-muted-foreground/60">
          {tab.lang === "sql" ? "SELECT … FROM " + (tab.coll ?? "collection") : "db." + (tab.coll ?? "collection") + ".find()"}
        </span>
        <div className="flex-1" />
        <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[11px]" onClick={doSave}>
          <Save className="h-3 w-3" /> {t("set.save")}
        </Button>
        <Button
          variant="ghost"
          className="tcn-accent-soft h-8 gap-1 px-3 text-xs font-medium text-tucano-700 transition hover:brightness-110 dark:text-tucano-300"
          onClick={exec}
          disabled={tab.loading}
        >
          {tab.loading ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="mr-1 h-3.5 w-3.5" fill="currentColor" />
          )}
          Run
          <kbd className="ml-1.5 rounded bg-tucano-400/15 px-1 text-[9px] text-tucano-700 dark:text-tucano-300">⌘↵</kbd>
        </Button>
      </div>

      <div className="min-h-0 flex-1 px-3 pb-2 pt-2">
        <RawEditor
          value={tab.query}
          onChange={(q) => update(tab.id, { query: q })}
          extensions={extensions}
          language={language}
          minHeight={0}
          className="h-full border-input bg-card"
        />
      </div>
    </div>
  );
}
