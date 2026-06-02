import { useEffect, useState } from "react";
import { Eraser, History, Loader2, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RawEditor } from "@/viewers/RawEditor";
import { ipc } from "@/lib/ipc";
import { useTabs } from "@/stores/tabs";
import { useTree } from "@/stores/tree";
import { useSettings } from "@/stores/settings";
import { formatBytes } from "@/lib/bsonTypes";
import { formatDate } from "@/lib/format";
import type { HistoryEntry } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

const OP_KEY: Record<string, string> = {
  delete: "op.delete",
  deleteMany: "op.deleteMany",
  update: "op.update",
  replace: "op.update",
  insert: "op.insert",
  restore: "op.restore",
};
const OP_COLOR: Record<string, string> = {
  delete: "text-destructive",
  deleteMany: "text-destructive",
  update: "text-amber-500",
  replace: "text-amber-500",
  insert: "text-emerald-500",
  restore: "text-tucano-400",
};

function entryCount(e: HistoryEntry): number {
  if (e.op === "deleteMany" && e.beforeJson) {
    try {
      const a = JSON.parse(e.beforeJson);
      return Array.isArray(a) ? a.length : 1;
    } catch {
      return 1;
    }
  }
  return 1;
}
function entrySize(e: HistoryEntry): number {
  return (e.beforeJson ?? e.afterJson ?? "").length;
}
function previewText(e: HistoryEntry | null): string {
  if (!e) return "";
  const raw = e.op === "insert" ? e.afterJson : e.beforeJson;
  if (!raw) return "";
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

export function HistoryPanel({
  open,
  connId,
  db,
  coll,
  onClose,
}: {
  open: boolean;
  connId: string;
  db: string;
  coll: string;
  onClose: () => void;
}) {
  const t = useT();
  const settings = useSettings((s) => s.settings);
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [selected, setSelected] = useState<HistoryEntry | null>(null);
  const [busy, setBusy] = useState<"" | "restore" | "remove" | "empty">("");

  const reload = () =>
    ipc
      .listHistory(connId, db, coll, 500)
      .then((e) => {
        setEntries(e);
        setSelected((cur) => e.find((x) => x.id === cur?.id) ?? e[0] ?? null);
      })
      .catch(() => setEntries([]));

  useEffect(() => {
    if (!open || !connId) return;
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, connId, db, coll]);

  const afterMutation = async () => {
    const tabs = useTabs.getState();
    if (tabs.activeId) tabs.run(tabs.activeId);
    useTree.getState().loadCollections(connId, db); // refresh sidebar backup indicator
    await reload();
  };

  const canRestore =
    !!selected && ["delete", "deleteMany", "update", "replace"].includes(selected.op);

  const restore = async () => {
    if (!selected || !window.confirm(t("hist.restoreConfirm"))) return;
    setBusy("restore");
    try {
      await ipc.restoreHistoryEntry(selected.id);
      await afterMutation();
    } finally {
      setBusy("");
    }
  };
  const remove = async () => {
    if (!selected) return;
    setBusy("remove");
    try {
      await ipc.deleteHistoryEntry(selected.id);
      await afterMutation();
    } finally {
      setBusy("");
    }
  };
  const empty = async () => {
    if (!window.confirm(t("hist.emptyConfirm"))) return;
    setBusy("empty");
    try {
      await ipc.clearHistory(connId, db, coll);
      await afterMutation();
    } finally {
      setBusy("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="tcn-glass-strong sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4 text-tucano-400" />
            {t("history.title")} — <span className="mono text-tucano-400">{coll}</span>
          </DialogTitle>
        </DialogHeader>

        {/* Toolbar */}
        <div className="flex items-center gap-1 border-b border-border pb-2 text-xs">
          <Button variant="ghost" size="sm" className="h-7 gap-1.5" onClick={reload}>
            <RefreshCw className="h-3.5 w-3.5" /> {t("common.refresh")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-tucano-400 disabled:text-muted-foreground"
            disabled={!canRestore || !!busy}
            onClick={restore}
          >
            {busy === "restore" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
            {t("hist.restore")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5"
            disabled={!selected || !!busy}
            onClick={remove}
          >
            <Trash2 className="h-3.5 w-3.5" /> {t("hist.remove")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-destructive"
            disabled={entries.length === 0 || !!busy}
            onClick={empty}
          >
            <Eraser className="h-3.5 w-3.5" /> {t("hist.emptyAll")}
          </Button>
        </div>

        {entries.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">{t("history.empty")}</div>
        ) : (
          <div className="flex flex-col gap-2" style={{ height: 460 }}>
            {/* Entries table */}
            <div className="overflow-auto rounded-md border border-border scroll-thin" style={{ maxHeight: 200 }}>
              <div className="sticky top-0 z-10 flex border-b border-border bg-card text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <div className="w-28 px-3 py-1.5">{t("hist.colAction")}</div>
                <div className="w-16 px-3 py-1.5 text-right">{t("hist.colCount")}</div>
                <div className="flex-1 px-3 py-1.5">{t("hist.colChange")}</div>
                <div className="w-20 px-3 py-1.5 text-right">{t("hist.colSize")}</div>
              </div>
              {entries.map((e) => (
                <button
                  key={e.id}
                  onClick={() => setSelected(e)}
                  className={cn(
                    "flex w-full items-center border-b border-border/40 text-left text-[12px] hover:bg-accent/40",
                    selected?.id === e.id && "bg-tucano-400/10"
                  )}
                >
                  <div className={cn("w-28 px-3 py-1.5 font-medium", OP_COLOR[e.op])}>{OP_KEY[e.op] ? t(OP_KEY[e.op]) : e.op}</div>
                  <div className="mono w-16 px-3 py-1.5 text-right tabular-nums">{entryCount(e)}</div>
                  <div className="mono flex-1 px-3 py-1.5 text-muted-foreground">{formatDate(e.ts, settings)}</div>
                  <div className="mono w-20 px-3 py-1.5 text-right text-muted-foreground">{formatBytes(entrySize(e))}</div>
                </button>
              ))}
            </div>

            {/* Action preview */}
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t("hist.preview")}
                {selected && (
                  <span className="mono lowercase text-muted-foreground/60">
                    {entryCount(selected)} doc{entryCount(selected) > 1 ? "s" : ""}
                  </span>
                )}
              </div>
              <RawEditor value={previewText(selected)} readOnly minHeight={0} className="flex-1" />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
