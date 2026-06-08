import { create } from "zustand";
import { useEffect, useMemo, useState } from "react";
import { Check, FileDown } from "lucide-react";
import { save } from "@tauri-apps/plugin-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useTabs } from "@/stores/tabs";
import { ipc } from "@/lib/ipc";
import { parse } from "@/lib/queryParser";
import type { ExportFormat } from "@/lib/types";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type DialogState = { tabId: string | null; open: (tabId: string) => void; close: () => void };
export const useExportDialog = create<DialogState>((set) => ({
  tabId: null,
  open: (tabId) => set({ tabId }),
  close: () => set({ tabId: null }),
}));

const FORMATS: ExportFormat[] = ["json", "csv", "xlsx"];

/** Filesystem-safe default export name: `<db>.<coll>_<scope>_<YYYY-MM-DD_HHmm>`. */
function defaultExportName(db: string, coll: string, scope: "filtered" | "all"): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
  const safe = (s: string) => s.replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "");
  return `${safe(db)}.${safe(coll)}_${scope}_${stamp}`;
}

export function ExportDialog() {
  const t = useT();
  const tabId = useExportDialog((s) => s.tabId);
  const close = useExportDialog((s) => s.close);
  const tabs = useTabs((s) => s.tabs);
  const tab = tabs.find((t) => t.id === tabId);

  const [format, setFormat] = useState<ExportFormat>("json");
  const [scope, setScope] = useState<"filtered" | "all">("filtered");
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  // Parse once to learn the filter/sort and whether "filtered" is even possible.
  const parsed = useMemo(() => {
    if (!tab) return null;
    try {
      return parse(tab.lang, tab.query);
    } catch {
      return null;
    }
  }, [tab]);
  const canFilter = parsed?.kind === "find" || parsed?.kind === "count";

  // Union of top-level columns from the current result page.
  const columns = useMemo(() => {
    const seen = new Set<string>();
    const cols: string[] = [];
    for (const d of tab?.result?.docs ?? []) {
      for (const k of Object.keys(d)) {
        if (!seen.has(k)) {
          seen.add(k);
          cols.push(k);
        }
      }
    }
    return cols.sort((a, b) => (a === "_id" ? -1 : b === "_id" ? 1 : 0));
  }, [tab?.result]);

  // Reset state whenever a fresh dialog opens.
  useEffect(() => {
    if (!tabId) return;
    setExcluded(new Set());
    setBusy(false);
    setScope(canFilter ? "filtered" : "all");
  }, [tabId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!tab) return null;

  const toggle = (c: string) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });

  const confirm = async () => {
    if (!tab.coll) return;
    let filter = "{}";
    let sort = "";
    if (scope === "filtered" && parsed) {
      if (parsed.kind === "find") {
        filter = parsed.filter;
        sort = parsed.sort;
      } else if (parsed.kind === "count") {
        filter = parsed.filter;
      }
    }
    const fields = columns.filter((c) => !excluded.has(c));
    // `[]` tells the backend "all fields" (union across docs) — only safe when the
    // query has no projection. With a projection, the visible columns ARE the
    // intended set, so pass them explicitly even when nothing is unchecked.
    const proj = parsed?.kind === "find" ? parsed.projection.trim() : "";
    const hasProjection = proj !== "" && proj !== "{}";
    const fieldsArg = excluded.size === 0 && !hasProjection ? [] : fields;
    const path = await save({
      defaultPath: `${defaultExportName(tab.db, tab.coll, scope)}.${format}`,
      filters: [{ name: format.toUpperCase(), extensions: [format] }],
    });
    if (!path) return;
    setBusy(true);
    try {
      await ipc.exportDocuments({
        connId: tab.connId,
        db: tab.db,
        coll: tab.coll,
        filter,
        sort,
        limit: 100000,
        format,
        path,
        fields: fieldsArg,
      });
      close();
    } catch (e) {
      console.error("export failed", e);
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent className="tcn-glass-strong sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileDown className="h-4 w-4 text-tucano-400" />
            {t("common.export")} · <span className="mono">{tab.coll}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Format */}
          <div className="space-y-1.5">
            <Label>{t("export.format")}</Label>
            <div className="flex gap-1 rounded-lg bg-muted p-0.5">
              {FORMATS.map((f) => (
                <button
                  key={f}
                  onClick={() => setFormat(f)}
                  className={cn(
                    "flex-1 rounded-md px-2 py-1 text-xs font-medium uppercase transition",
                    format === f
                      ? "bg-card text-tucano-600 shadow-sm dark:text-tucano-300"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Scope */}
          <div className="space-y-1.5">
            <Label>{t("export.scope")}</Label>
            <div className="flex gap-1 rounded-lg bg-muted p-0.5">
              <button
                onClick={() => canFilter && setScope("filtered")}
                disabled={!canFilter}
                className={cn(
                  "flex-1 rounded-md px-2 py-1 text-xs font-medium transition disabled:opacity-40",
                  scope === "filtered"
                    ? "bg-card text-tucano-600 shadow-sm dark:text-tucano-300"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t("export.filtered")}
              </button>
              <button
                onClick={() => setScope("all")}
                className={cn(
                  "flex-1 rounded-md px-2 py-1 text-xs font-medium transition",
                  scope === "all"
                    ? "bg-card text-tucano-600 shadow-sm dark:text-tucano-300"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t("export.all")}
              </button>
            </div>
            {!canFilter && <p className="text-[11px] text-muted-foreground">{t("export.aggNote")}</p>}
          </div>

          {/* Columns */}
          {columns.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>{t("export.columns")}</Label>
                <div className="flex gap-2 text-[11px]">
                  <button className="text-muted-foreground hover:text-foreground" onClick={() => setExcluded(new Set())}>
                    {t("export.all")}
                  </button>
                  <button
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => setExcluded(new Set(columns))}
                  >
                    {t("export.none")}
                  </button>
                </div>
              </div>
              <div className="max-h-44 space-y-0.5 overflow-auto rounded-md border border-border p-1 scroll-thin">
                {columns.map((c) => {
                  const on = !excluded.has(c);
                  return (
                    <button
                      key={c}
                      onClick={() => toggle(c)}
                      className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[12px] hover:bg-accent"
                    >
                      <span
                        className={cn(
                          "grid h-3.5 w-3.5 shrink-0 place-items-center rounded border",
                          on ? "border-tucano-400 bg-tucano-400/20 text-tucano-500 dark:text-tucano-300" : "border-border"
                        )}
                      >
                        {on && <Check className="h-2.5 w-2.5" />}
                      </span>
                      <span className="mono truncate">{c}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close}>
            {t("common.cancel")}
          </Button>
          <Button className="tcn-accent border-0" onClick={confirm} disabled={busy}>
            {busy ? t("export.exporting") : t("common.export")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
