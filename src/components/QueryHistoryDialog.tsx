import { create } from "zustand";
import { useMemo } from "react";
import { Clock, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useQueryLog } from "@/stores/queryLog";
import { useTabs } from "@/stores/tabs";
import { timeAgo } from "@/lib/format";
import { useT } from "@/lib/i18n";

type DialogState = { open: boolean; show: () => void; close: () => void };
export const useQueryHistory = create<DialogState>((set) => ({
  open: false,
  show: () => set({ open: true }),
  close: () => set({ open: false }),
}));

export function QueryHistoryDialog() {
  const t = useT();
  const open = useQueryHistory((s) => s.open);
  const close = useQueryHistory((s) => s.close);
  const entries = useQueryLog((s) => s.entries);
  const clear = useQueryLog((s) => s.clear);
  const activeId = useTabs((s) => s.activeId);
  const tabs = useTabs((s) => s.tabs);
  const update = useTabs((s) => s.update);
  const active = tabs.find((tb) => tb.id === activeId);

  // History scoped to the active server + database.
  const scoped = useMemo(
    () =>
      active
        ? entries.filter((e) => e.connId === active.connId && e.db === active.db)
        : entries,
    [entries, active]
  );

  if (!open) return null;

  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent className="tcn-glass-strong sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-tucano-400" />
            {t("query.dbHistory")}
            {active && <span className="mono text-xs text-muted-foreground">· {active.db}</span>}
          </DialogTitle>
        </DialogHeader>

        {scoped.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">—</div>
        ) : (
          <div className="max-h-[60vh] space-y-1 overflow-auto scroll-thin">
            {scoped.map((e) => (
              <button
                key={e.id}
                onClick={() => {
                  if (active) update(active.id, { query: e.query, lang: e.lang });
                  close();
                }}
                className="flex w-full items-center gap-3 rounded-md border border-border/60 px-3 py-2 text-left hover:border-tucano-400/40 hover:bg-accent/40"
              >
                <span className="mono shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                  {e.lang}
                </span>
                <span className="mono min-w-0 flex-1 truncate text-[12px]">{e.query.replace(/\s+/g, " ")}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(e.ts)}</span>
              </button>
            ))}
          </div>
        )}

        {scoped.length > 0 && active && (
          <Button
            variant="ghost"
            size="sm"
            className="self-end text-xs text-destructive"
            onClick={() => clear(active.connId, active.db)}
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Clear
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
