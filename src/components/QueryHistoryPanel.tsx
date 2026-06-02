import { useState } from "react";
import { Check, Code2, Eraser, Search, Trash2 } from "lucide-react";
import { useQueryLog, type LogEntry } from "@/stores/queryLog";
import { useTabs, useActiveTab } from "@/stores/tabs";
import { useConnections } from "@/stores/connections";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { timeAgo } from "@/lib/format";
import type { ConnColor } from "@/lib/types";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function QueryHistoryPanel() {
  const t = useT();
  const entries = useQueryLog((s) => s.entries);
  const remove = useQueryLog((s) => s.remove);
  const clear = useQueryLog((s) => s.clear);
  const openQuery = useTabs((s) => s.openQuery);
  const applyQuery = useTabs((s) => s.applyQuery);
  const connections = useConnections((s) => s.list);
  const tab = useActiveTab();
  const [filter, setFilter] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const q = filter.trim().toLowerCase();
  const shown = entries.filter((e) => {
    if (!showAll && tab && (e.connId !== tab.connId || e.db !== tab.db)) return false;
    if (q && !e.query.toLowerCase().includes(q)) return false;
    return true;
  });

  const allSelected = shown.length > 0 && shown.every((e) => selected.has(e.id));
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(shown.map((e) => e.id)));
  const deleteSelected = () => {
    remove([...selected]);
    setSelected(new Set());
  };

  const load = (e: LogEntry) => {
    const connId = e.connId || tab?.connId;
    const conn = connections.find((c) => c.id === connId);
    const db = e.db || tab?.db;
    if (connId && db) {
      openQuery(
        { connId, connName: conn?.name ?? e.connName ?? "server", connColor: (conn?.color ?? "teal") as ConnColor, db },
        e.coll || null,
        e.query,
        e.lang
      );
    } else {
      applyQuery(e.query, e.lang);
    }
  };

  return (
    <div className="flex h-full w-full min-w-0 flex-col">
      <div className="flex items-center justify-between px-3 pb-1 pt-2.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {t("history.title")}
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => clear()}
              className="grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <Eraser className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">{t("common.clearAll")}</TooltipContent>
        </Tooltip>
      </div>

      <label className="flex items-center gap-2 px-3 pb-1.5 text-[11px] text-muted-foreground">
        <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="accent-tucano-400" />
        {t("common.showAll")}
      </label>

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

      {/* Selection bar */}
      {shown.length > 0 && (
        <div className="flex items-center justify-between gap-2 border-y border-border/60 bg-muted/30 px-3 py-1.5 text-[11px]">
          <button onClick={toggleAll} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
            <span
              className={cn(
                "grid h-4 w-4 place-items-center rounded border",
                allSelected ? "border-tucano-400 bg-tucano-400 text-white" : "border-border"
              )}
            >
              {allSelected && <Check className="h-3 w-3" />}
            </span>
            {allSelected ? t("common.unselectAll") : t("common.selectAll")}
          </button>
          {selected.size > 0 && (
            <button
              onClick={deleteSelected}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 font-medium text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-3 w-3" /> {t("common.delete")} ({selected.size})
            </button>
          )}
        </div>
      )}

      <div className="flex-1 overflow-auto px-1.5 py-1 scroll-thin">
        {shown.length === 0 ? (
          <div className="px-3 py-8 text-center text-[11px] text-muted-foreground/70">—</div>
        ) : (
          shown.map((e) => {
            const on = selected.has(e.id);
            return (
              <div
                key={e.id}
                className={cn(
                  "group flex items-start gap-2 rounded-md px-1.5 py-2 hover:bg-accent",
                  on && "bg-tucano-400/10"
                )}
              >
                <button
                  onClick={() => toggle(e.id)}
                  className={cn(
                    "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border transition",
                    on ? "border-tucano-400 bg-tucano-400 text-white" : "border-border/70 hover:border-tucano-400"
                  )}
                >
                  {on && <Check className="h-3 w-3" />}
                </button>
                <button onClick={() => load(e)} className="flex min-w-0 flex-1 items-start gap-1.5 text-left">
                  <Code2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-tucano-400" />
                  <div className="min-w-0 flex-1">
                    <div className="mono truncate text-[12px]">{e.query.replace(/\s+/g, " ")}</div>
                    <div className="truncate text-[10px] text-muted-foreground/70">
                      {showAll ? `${e.connName} · ${e.db} · ` : ""}
                      {timeAgo(e.ts)}
                    </div>
                  </div>
                </button>
                <button
                  onClick={() => remove([e.id])}
                  className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded text-muted-foreground opacity-0 transition hover:text-destructive group-hover:opacity-100"
                  title={t("common.delete")}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
