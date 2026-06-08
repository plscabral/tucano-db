import { useState } from "react";
import { Code2, Plus, Search, Trash2 } from "lucide-react";
import { useSavedQueries } from "@/stores/savedQueries";
import { useSaveDialog } from "@/components/SaveQueryDialog";
import { useTabs, useActiveTab } from "@/stores/tabs";
import { useConnections } from "@/stores/connections";
import { timeAgo } from "@/lib/format";
import type { ConnColor } from "@/lib/types";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function SavedQueriesPanel() {
  const t = useT();
  const list = useSavedQueries((s) => s.list);
  const openSave = useSaveDialog((s) => s.open);
  const remove = useSavedQueries((s) => s.remove);
  const openQuery = useTabs((s) => s.openQuery);
  const applyQuery = useTabs((s) => s.applyQuery);
  const connections = useConnections((s) => s.list);
  const active = useConnections((s) => s.active);
  const connect = useConnections((s) => s.connect);
  const tab = useActiveTab();
  const [filter, setFilter] = useState("");

  const q = filter.trim().toLowerCase();
  const shown = q ? list.filter((s) => s.name.toLowerCase().includes(q)) : list;

  const saveCurrent = () => {
    if (tab) openSave(tab.id);
  };

  const load = async (s: (typeof list)[number]) => {
    const connId = s.connId || tab?.connId;
    const conn = connections.find((c) => c.id === connId);
    const db = s.db ?? tab?.db;
    if (connId && db) {
      // The saved query may target a connection that isn't open yet — opening it
      // and running immediately would fail with "not connected". Connect first.
      if (!active.has(connId)) {
        const ok = await connect(connId);
        if (!ok) return; // failure surfaced by the connections store
      }
      openQuery(
        { connId, connName: conn?.name ?? "server", connColor: (conn?.color ?? "teal") as ConnColor, db },
        s.coll,
        s.query,
        s.lang
      );
    } else {
      applyQuery(s.query, s.lang);
    }
  };

  return (
    <div className="flex h-full w-full min-w-0 flex-col">
      <div className="flex items-center justify-between px-3 pb-1.5 pt-2.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {t("query.saved")}
        </span>
        <button
          onClick={saveCurrent}
          disabled={!tab}
          className="grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
          title={t("query.saveCurrent")}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="px-2.5 pb-2">
        <div className="flex h-7 items-center gap-1.5 rounded-md border border-border bg-background/60 px-2 focus-within:border-tucano-400/60">
          <Search className="h-3 w-3 shrink-0 text-muted-foreground" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("common.filter")}
            className="h-full w-full bg-transparent text-[12px] outline-none placeholder:text-muted-foreground/60"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto px-1.5 pb-2 scroll-thin">
        {shown.length === 0 ? (
          <div className="px-3 py-8 text-center text-[11px] text-muted-foreground/70">
            {t("sq.empty")}
          </div>
        ) : (
          shown.map((s) => (
            <div
              key={s.id}
              className="group flex cursor-pointer items-start gap-2 rounded-md px-2 py-2 hover:bg-accent"
              onClick={() => load(s)}
            >
              <Code2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-tucano-400" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium">{s.name}</div>
                <div className="mono truncate text-[10px] text-muted-foreground/70">
                  {s.lang} · {timeAgo(s.ts)}
                </div>
              </div>
              <button
                className="grid h-5 w-5 shrink-0 place-items-center rounded text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  remove(s.id);
                }}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
