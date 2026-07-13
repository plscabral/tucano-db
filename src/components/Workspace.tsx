import { useEffect } from "react";
import { Copy, Plus, X } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Toolbar } from "@/components/Toolbar";
import { QueryEditor } from "@/components/QueryEditor";
import { Pagination } from "@/components/Pagination";
import { TreeView } from "@/components/views/TreeView";
import { TableView } from "@/components/views/TableView";
import { JsonView } from "@/components/views/JsonView";
import { HtmlView } from "@/components/views/HtmlView";
import { Display } from "@/components/Display";
import { LogoMark } from "@/components/Logo";
import { useTabs, useActiveTab, type Tab } from "@/stores/tabs";
import { useTree } from "@/stores/tree";
import { useConnections } from "@/stores/connections";
import { useAutoRefresh } from "@/stores/autorefresh";
import { CONN_COLOR_HEX } from "@/lib/types";
import { Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = IS_MAC ? "⌘" : "Ctrl";

function TabsBar() {
  const tabs = useTabs((s) => s.tabs);
  const activeId = useTabs((s) => s.activeId);
  const setActive = useTabs((s) => s.setActive);
  const closeTab = useTabs((s) => s.closeTab);
  const closeOthers = useTabs((s) => s.closeOthers);
  const closeAll = useTabs((s) => s.closeAll);
  const closeRight = useTabs((s) => s.closeRight);
  const duplicateTab = useTabs((s) => s.duplicateTab);
  const newTab = useTabs((s) => s.newTab);
  const tr = useT();
  const active = tabs.find((t) => t.id === activeId);
  const connections = useConnections((s) => s.list);

  // No tabs → don't render an empty bar (it reads as an unfinished strip).
  if (tabs.length === 0) return null;

  const addTab = () => {
    if (!active) return;
    const conn = connections.find((c) => c.id === active.connId);
    newTab({
      connId: active.connId,
      connName: conn?.name ?? active.connName,
      connColor: active.connColor,
      db: active.db,
    });
  };

  return (
    <div className="flex items-center gap-0.5 overflow-x-auto border-b border-border bg-card px-1.5 py-1 scroll-thin">
      {tabs.map((t) => (
        <ContextMenu key={t.id}>
          <ContextMenuTrigger asChild>
            <button
              onClick={() => setActive(t.id)}
              onAuxClick={(e) => {
                // Middle-click (mouse wheel button) closes the tab.
                if (e.button === 1) {
                  e.preventDefault();
                  closeTab(t.id);
                }
              }}
              onMouseDown={(e) => e.button === 1 && e.preventDefault()}
              className={cn(
                "group flex h-7 min-w-0 max-w-[200px] shrink-0 items-center gap-1.5 rounded-md px-2 text-[12px]",
                t.id === activeId ? "tcn-accent-soft text-foreground" : "text-muted-foreground hover:bg-accent"
              )}
            >
              {t.dirty ? (
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: CONN_COLOR_HEX[t.connColor] }}
                  title={tr("ws.unsaved")}
                />
              ) : (
                <span className="h-1.5 w-1.5 shrink-0" />
              )}
              <span className="mono truncate">{t.coll ?? "query"}</span>
              <span
                role="button"
                tabIndex={-1}
                className="ml-0.5 grid h-4 w-4 shrink-0 place-items-center rounded opacity-0 hover:bg-foreground/10 group-hover:opacity-60"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(t.id);
                }}
              >
                <X className="h-3 w-3" />
              </span>
            </button>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-48">
            <ContextMenuItem onClick={() => closeTab(t.id)}>Fechar</ContextMenuItem>
            <ContextMenuItem onClick={() => closeOthers(t.id)}>Fechar outras</ContextMenuItem>
            <ContextMenuItem onClick={() => closeAll()}>Fechar todas</ContextMenuItem>
            <ContextMenuItem onClick={() => closeRight(t.id)}>Fechar abas à direita</ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => duplicateTab(t.id)}>
              <Copy className="mr-2 h-3.5 w-3.5" /> Duplicar
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      ))}
      {tabs.length > 0 && (
        <button
          onClick={addTab}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function ResultArea({ tab }: { tab: Tab }) {
  const t = useT();
  const docs = tab.result?.docs ?? [];
  return (
    <div className="relative min-h-0 flex-1 overflow-hidden bg-card">
      {tab.loading && docs.length === 0 && (
        <div className="absolute inset-0 grid place-items-center">
          <Loader2 className="h-5 w-5 animate-spin text-tucano-400" />
        </div>
      )}
      {tab.error && (
        <div className="m-3 rounded-md border border-destructive/40 px-3 py-2 text-xs text-destructive">
          <span className="mono break-all">{tab.error}</span>
        </div>
      )}
      {!tab.error && docs.length === 0 && !tab.loading && (
        <div className="grid h-full place-items-center text-sm text-muted-foreground">
          {t("ws.noDocs")}
        </div>
      )}
      {docs.length > 0 && (
        <div className="h-full">
          {tab.viewMode === "tree" && <TreeView docs={docs} />}
          {tab.viewMode === "table" && <TableView docs={docs} />}
          {tab.viewMode === "json" && <JsonView docs={docs} />}
          {tab.viewMode === "html" && <HtmlView docs={docs} />}
        </div>
      )}
    </div>
  );
}

export function Workspace() {
  const t = useT();
  const tab = useActiveTab();
  const run = useTabs((s) => s.run);
  const open = useTree((s) => s.open);
  const { enabled, intervalMs } = useAutoRefresh();

  // Auto-refresh the active tab.
  useEffect(() => {
    if (!enabled || !tab) return;
    const id = setInterval(() => run(tab.id), intervalMs);
    return () => clearInterval(id);
  }, [enabled, intervalMs, tab, run]);

  if (!tab) {
    const shortcuts: [string, string][] = [
      [t("query.run"), `${MOD} ↵`],
      [t("common.refresh"), `${MOD} R`],
      ["Autocomplete", "Ctrl Space"],
      [t("settings.title"), `${MOD} ,`],
    ];
    return (
      <div className="tcn-grid flex flex-1 flex-col">
        <TabsBar />
        <div className="relative grid flex-1 place-items-center overflow-hidden px-6">
          <div
            className="pointer-events-none absolute left-1/2 top-1/3 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-50"
            style={{ background: "radial-gradient(closest-side, rgba(var(--tucano-rgb),0.16), transparent 70%)" }}
          />
          <div className="relative w-full max-w-sm text-center">
            <div className="relative mx-auto mb-5 inline-block">
              <div className="tcn-aura absolute -inset-3" />
              <LogoMark className="relative h-14 w-14" />
            </div>
            <div className="text-2xl">
              <Display lead={t("ws.pickLead")} accent={t("ws.pickAccent")} tail={t("ws.pickTail")} />
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {open.length === 0 ? t("ws.pickHintEmpty") : t("ws.pickHint")}
            </p>

            <div className="mt-7 rounded-xl border border-border bg-card/50 p-1.5 text-left">
              {shortcuts.map(([label, keys]) => (
                <div
                  key={label}
                  className="flex items-center justify-between rounded-lg px-3 py-2 text-[13px] hover:bg-accent/40"
                >
                  <span className="text-muted-foreground">{label}</span>
                  <span className="flex gap-1">
                    {keys.split(" ").map((k, i) => (
                      <kbd
                        key={i}
                        className="mono rounded-md border border-border bg-muted px-1.5 py-0.5 text-[11px] text-foreground/80"
                      >
                        {k}
                      </kbd>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <TabsBar />
      <ResizablePanelGroup direction="vertical" autoSaveId="tucano-db:query" className="flex-1">
        <ResizablePanel defaultSize={32} minSize={14} className="flex">
          <QueryEditor tab={tab} />
        </ResizablePanel>
        <ResizableHandle className="transition-colors hover:bg-tucano-400/50" />
        <ResizablePanel defaultSize={68} minSize={25} className="flex flex-col">
          <Toolbar tab={tab} />
          <ResultArea tab={tab} />
        </ResizablePanel>
      </ResizablePanelGroup>
      {!tab.isAggregate && <Pagination tab={tab} />}
    </div>
  );
}
