import { create } from "zustand";
import { useEffect, useState } from "react";
import { Check, Database, ListChecks } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useTree } from "@/stores/tree";
import { useConnections } from "@/stores/connections";
import { formatBytes } from "@/lib/bsonTypes";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

type DialogState = { connId: string | null; open: (connId: string) => void; close: () => void };

/** Driver for the "choose visible databases" dialog (DataGrip-style). */
export const useDbChooser = create<DialogState>((set) => ({
  connId: null,
  open: (connId) => set({ connId }),
  close: () => set({ connId: null }),
}));

export function DatabasesDialog() {
  const connId = useDbChooser((s) => s.connId);
  const close = useDbChooser((s) => s.close);
  const trees = useTree((s) => s.trees);
  const connections = useConnections((s) => s.list);
  const setVisibleDbs = useConnections((s) => s.setVisibleDbs);
  const t = useT();

  const conn = connections.find((c) => c.id === connId);
  const databases = connId ? trees[connId]?.databases ?? [] : [];
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!conn) return;
    // No explicit selection yet = all visible.
    setSelected(new Set(conn.visibleDbs.length ? conn.visibleDbs : databases.map((d) => d.name)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connId]);

  if (!connId || !conn) return null;

  const toggle = (name: string) => {
    const next = new Set(selected);
    next.has(name) ? next.delete(name) : next.add(name);
    setSelected(next);
  };
  const allSelected = databases.length > 0 && selected.size === databases.length;
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(databases.map((d) => d.name)));

  const save = async () => {
    // Store all-selected as the explicit full list so the choice is remembered.
    await setVisibleDbs(connId, [...selected]);
    close();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent className="tcn-glass-strong max-w-[calc(100vw-2rem)] sm:max-w-md">
        <DialogHeader className="min-w-0 pr-8">
          <DialogTitle className="flex min-w-0 items-center gap-2">
            <ListChecks className="h-4 w-4 text-tucano-400" />
            <span className="shrink-0">{t("dbsel.title")} —</span>
            <span className="min-w-0 flex-1 truncate" title={conn.name}>{conn.name}</span>
          </DialogTitle>
        </DialogHeader>

        <button
          onClick={toggleAll}
          className="flex items-center gap-2 self-start rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
        >
          <span
            className={cn(
              "grid h-4 w-4 place-items-center rounded border",
              allSelected ? "border-tucano-400 bg-tucano-400 text-white" : "border-border"
            )}
          >
            {allSelected && <Check className="h-3 w-3" />}
          </span>
          {t("common.selectAll")}
        </button>

        <div className="max-h-[50vh] space-y-1 overflow-auto scroll-thin">
          {databases.map((d) => {
            const on = selected.has(d.name);
            return (
              <button
                key={d.name}
                onClick={() => toggle(d.name)}
                className="flex w-full items-center gap-2.5 rounded-md border border-border/60 px-3 py-2 text-left text-sm hover:border-tucano-400/40 hover:bg-accent/40"
              >
                <span
                  className={cn(
                    "grid h-4 w-4 shrink-0 place-items-center rounded border",
                    on ? "border-tucano-400 bg-tucano-400 text-white" : "border-border"
                  )}
                >
                  {on && <Check className="h-3 w-3" />}
                </span>
                <Database className="h-3.5 w-3.5 shrink-0 text-tucano-400/80" />
                <span className="flex-1 truncate">{d.name}</span>
                <span className="mono text-[11px] text-muted-foreground">{formatBytes(d.sizeOnDisk)}</span>
              </button>
            );
          })}
          {databases.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">—</div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close}>
            {t("common.cancel")}
          </Button>
          <Button className="tcn-accent border-0" onClick={save}>
            {t("common.apply")} ({selected.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
