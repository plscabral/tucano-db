import { useState } from "react";
import {
  ChevronRight,
  Copy,
  Database,
  FileStack,
  FolderPlus,
  History,
  KeyRound,
  ListChecks,
  MoreHorizontal,
  Pencil,
  Plus,
  Plug,
  RefreshCw,
  Search,
  Server,
  Table2,
  Trash2,
  Unplug,
} from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTree } from "@/stores/tree";
import { useTabs, useActiveTab } from "@/stores/tabs";
import { useConnections } from "@/stores/connections";
import { useCollActions, type CollAction } from "@/stores/collActions";
import { useConnDialog } from "@/stores/connDialog";
import { useDbChooser } from "@/components/DatabasesDialog";
import { ipc } from "@/lib/ipc";
import { formatBytes, formatCount } from "@/lib/bsonTypes";
import { CONN_COLOR_HEX, type ConnColor, type IndexInfo } from "@/lib/types";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const { open, trees, expandedConns } = useTree();
  const toggleConn = useTree((s) => s.toggleConn);
  const toggleDb = useTree((s) => s.toggleDb);
  const refreshServer = useTree((s) => s.refreshServer);
  const setRoute = useTree((s) => s.setRoute);
  const setFocused = useTree((s) => s.setFocused);
  const removeServer = useTree((s) => s.removeServer);
  const connections = useConnections((s) => s.list);
  const disconnect = useConnections((s) => s.disconnect);
  const closeForServer = useTabs((s) => s.closeForServer);
  const openCollection = useTabs((s) => s.openCollection);
  const openAction = useCollActions((s) => s.open);
  const openEditConn = useConnDialog((s) => s.openEdit);
  const openDbChooser = useDbChooser((s) => s.open);
  const active = useActiveTab();
  const t = useT();

  const [filter, setFilter] = useState("");
  const q = filter.trim().toLowerCase();
  const [expandedColls, setExpandedColls] = useState<Set<string>>(new Set());
  const toggleColl = (key: string) =>
    setExpandedColls((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  // Inline index listing under each collection's "Indexes" node.
  const [expandedIdx, setExpandedIdx] = useState<Set<string>>(new Set());
  const [idxCache, setIdxCache] = useState<Record<string, IndexInfo[]>>({});
  const toggleIdx = async (key: string, cid: string, db: string, coll: string) => {
    setExpandedIdx((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
    if (!idxCache[key]) {
      try {
        const list = await ipc.listIndexes(cid, db, coll);
        setIdxCache((p) => ({ ...p, [key]: list }));
      } catch {
        setIdxCache((p) => ({ ...p, [key]: [] }));
      }
    }
  };

  const copyUri = (connId: string) => {
    const c = connections.find((x) => x.id === connId);
    if (c) navigator.clipboard.writeText(c.uri);
  };

  const handleDisconnect = (connId: string) => {
    disconnect(connId);
    removeServer(connId);
    closeForServer(connId);
  };

  return (
    <aside className="flex h-full w-full min-w-0 flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 pb-1.5 pt-2.5">
        <div className="flex items-center gap-1.5">
          <Server className="h-3.5 w-3.5 text-tucano-400" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {t("sb.servers")}
          </span>
          {open.length > 0 && (
            <span className="mono rounded-full bg-muted px-1.5 text-[10px] tabular-nums text-muted-foreground">
              {open.length}
            </span>
          )}
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setRoute("connections")}>
              <Plug className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("conn.title")}</TooltipContent>
        </Tooltip>
      </div>

      {/* Filter */}
      <div className="px-2.5 pb-2">
        <div className="flex h-7 items-center gap-1.5 rounded-md border border-border bg-background/60 px-2 focus-within:border-tucano-400/60">
          <Search className="h-3 w-3 shrink-0 text-muted-foreground" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("sb.filterColls")}
            className="h-full w-full bg-transparent text-[12px] outline-none placeholder:text-muted-foreground/60"
          />
          {filter && (
            <button onClick={() => setFilter("")} className="text-muted-foreground hover:text-foreground">
              ×
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto px-1.5 pb-2 scroll-thin">
        {open.map((connId) => {
          const conn = connections.find((c) => c.id === connId);
          const tree = trees[connId];
          const connExpanded = expandedConns.has(connId) || !!q;
          const color = (conn?.color ?? "teal") as ConnColor;
          const hex = CONN_COLOR_HEX[color];
          return (
            <div key={connId} className="mb-0.5">
              {/* Server node */}
              <ContextMenu>
                <ContextMenuTrigger asChild>
                  <div
                    role="button"
                    tabIndex={0}
                    className="group flex w-full cursor-pointer items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-[13px] hover:bg-accent"
                    onClick={() => toggleConn(connId)}
                  >
                    <ChevronRight
                      className={cn(
                        "h-3.5 w-3.5 shrink-0 text-muted-foreground/70 transition-transform",
                        connExpanded && "rotate-90"
                      )}
                    />
                    <span
                      className="grid h-4 w-4 shrink-0 place-items-center rounded-full"
                      style={{ boxShadow: `0 0 0 1.5px ${hex}55` }}
                    >
                      <span className="h-2 w-2 rounded-full" style={{ background: hex, boxShadow: `0 0 6px ${hex}aa` }} />
                    </span>
                    <span className="flex-1 truncate font-semibold">{conn?.name ?? connId}</span>
                    {tree?.loading ? (
                      <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />
                    ) : (
                      tree?.databases && (
                        <span className="mono text-[10px] text-muted-foreground/70">{tree.databases.length}</span>
                      )
                    )}
                    <ServerMenu
                      onOverview={() => { setFocused(connId); setRoute("overview"); }}
                      onChooseDbs={() => openDbChooser(connId)}
                      onNewDb={() => openAction({ kind: "createDb", connId })}
                      onRefresh={() => refreshServer(connId)}
                      onCopyUri={() => copyUri(connId)}
                      onEdit={conn ? () => openEditConn(conn) : undefined}
                      onDisconnect={() => handleDisconnect(connId)}
                      t={t}
                    />
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-56">
                  <ContextMenuItem onClick={() => { setFocused(connId); setRoute("overview"); }}>
                    <Database className="mr-2 h-3.5 w-3.5" /> {t("nav.overview")}
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => openDbChooser(connId)}>
                    <ListChecks className="mr-2 h-3.5 w-3.5" /> {t("sb.chooseDbs")}
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => openAction({ kind: "createDb", connId })}>
                    <FolderPlus className="mr-2 h-3.5 w-3.5" /> {t("sb.newDatabase")}
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => refreshServer(connId)}>
                    <RefreshCw className="mr-2 h-3.5 w-3.5" /> {t("common.refresh")}
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem onClick={() => copyUri(connId)}>
                    <Copy className="mr-2 h-3.5 w-3.5" /> {t("sb.copyUri")}
                  </ContextMenuItem>
                  {conn && (
                    <ContextMenuItem onClick={() => openEditConn(conn)}>
                      <Pencil className="mr-2 h-3.5 w-3.5" /> {t("sb.editConnection")}
                    </ContextMenuItem>
                  )}
                  <ContextMenuSeparator />
                  <ContextMenuItem className="text-destructive" onClick={() => handleDisconnect(connId)}>
                    <Unplug className="mr-2 h-3.5 w-3.5" /> {t("conn.disconnect")}
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>

              {/* Databases — filtered by the connection's chosen visible set. */}
              {connExpanded &&
                (tree?.databases ?? [])
                  .filter((dbi) => !conn?.visibleDbs.length || conn.visibleDbs.includes(dbi.name))
                  .map((dbi) => {
                  const allCols = tree.collections[dbi.name] ?? [];
                  const cols = q ? allCols.filter((c) => c.name.toLowerCase().includes(q)) : allCols;
                  const dbMatches = dbi.name.toLowerCase().includes(q);
                  if (q && cols.length === 0 && !dbMatches) return null;
                  const dbExpanded = tree.expandedDbs.has(dbi.name) || (!!q && cols.length > 0);
                  return (
                    <div key={dbi.name} className="ml-[15px] border-l border-border/50 pl-1.5">
                      <ContextMenu>
                        <ContextMenuTrigger asChild>
                          <div
                            role="button"
                            tabIndex={0}
                            className="group flex w-full cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1.5 text-left text-[12.5px] hover:bg-accent"
                            onClick={() => toggleDb(connId, dbi.name)}
                          >
                            <ChevronRight
                              className={cn(
                                "h-3 w-3 shrink-0 text-muted-foreground/70 transition-transform",
                                dbExpanded && "rotate-90"
                              )}
                            />
                            <Database className="h-3.5 w-3.5 shrink-0 text-tucano-400/90" />
                            <span className="flex-1 truncate font-medium">{dbi.name}</span>
                            <span className="mono text-[10px] text-muted-foreground/60">{allCols.length || ""}</span>
                            <span className="mono text-[10px] text-muted-foreground/70">{formatBytes(dbi.sizeOnDisk)}</span>
                          </div>
                        </ContextMenuTrigger>
                        <ContextMenuContent className="w-48">
                          <ContextMenuItem onClick={() => openAction({ kind: "createColl", connId, db: dbi.name })}>
                            <FolderPlus className="mr-2 h-3.5 w-3.5" /> {t("sb.newCollection")}
                          </ContextMenuItem>
                          <ContextMenuSeparator />
                          <ContextMenuItem className="text-destructive" onClick={() => openAction({ kind: "dropDb", connId, db: dbi.name })}>
                            <Trash2 className="mr-2 h-3.5 w-3.5" /> {t("sb.dropDatabase")}
                          </ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>

                      {dbExpanded && (
                        <div className="ml-[14px] border-l border-border/40 pl-1.5">
                          {cols.length === 0 && (
                            <div className="px-2 py-1.5 text-[11px] text-muted-foreground/60">—</div>
                          )}
                          {cols.map((c) => {
                            const isView = c.type === "view";
                            const backupCount = tree.backups[dbi.name]?.[c.name] ?? 0;
                            const isActive =
                              active?.connId === connId && active?.db === dbi.name && active?.coll === c.name;
                            const collKey = `${connId}.${dbi.name}.${c.name}`;
                            const collExpanded = expandedColls.has(collKey);
                            const collAction = (kind: CollAction["kind"]): CollAction => ({
                              kind,
                              connId,
                              db: dbi.name,
                              coll: c.name,
                            });
                            return (
                              <div key={c.name}>
                                <ContextMenu>
                                  <ContextMenuTrigger asChild>
                                    <div
                                      role="button"
                                      tabIndex={0}
                                      className={cn(
                                        "group relative flex w-full cursor-pointer items-center gap-1 rounded-md py-1.5 pl-0.5 pr-1.5 text-left text-[12.5px]",
                                        isActive
                                          ? "tcn-accent-soft font-medium text-tucano-700 dark:text-tucano-200 ring-1 ring-inset ring-tucano-400/25"
                                          : "hover:bg-accent"
                                      )}
                                      onClick={() => {
                                        setRoute("browse");
                                        if (conn) {
                                          openCollection(
                                            { connId, connName: conn.name, connColor: color, db: dbi.name },
                                            c.name
                                          );
                                        }
                                      }}
                                    >
                                      <ChevronRight
                                        className={cn(
                                          "h-3 w-3 shrink-0 text-muted-foreground/50 transition-transform",
                                          collExpanded && "rotate-90"
                                        )}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          toggleColl(collKey);
                                        }}
                                      />
                                      {isView ? (
                                        <Table2 className="h-3.5 w-3.5 shrink-0 text-violet-400" />
                                      ) : (
                                        <FileStack
                                          className={cn("h-3.5 w-3.5 shrink-0", isActive ? "text-tucano-300" : "text-muted-foreground/70")}
                                        />
                                      )}
                                      <span className="flex-1 truncate">{c.name}</span>

                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="mono shrink-0 rounded bg-muted/70 px-1.5 py-px text-[10px] tabular-nums text-muted-foreground">
                                            {formatCount(c.count)}
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent side="top">{c.count.toLocaleString()} docs · {formatBytes(c.size)}</TooltipContent>
                                      </Tooltip>
                                      <span className="mono shrink-0 text-[10px] tabular-nums text-muted-foreground/55">
                                        {formatBytes(c.size)}
                                      </span>

                                      <CollMenu openAction={openAction} action={collAction} t={t} />
                                    </div>
                                  </ContextMenuTrigger>
                                  <ContextMenuContent className="w-48">
                                    <CollMenuItems openAction={openAction} action={collAction} t={t} ItemEl={ContextMenuItem} Sep={ContextMenuSeparator} />
                                  </ContextMenuContent>
                                </ContextMenu>

                                {collExpanded && (
                                  <div className="ml-[22px] flex flex-col border-l border-border/40 pl-1.5">
                                    <div
                                      role="button"
                                      tabIndex={0}
                                      className="flex cursor-pointer items-center gap-1 rounded-md py-1 pl-0.5 pr-1.5 text-left text-[12px] text-muted-foreground hover:bg-accent hover:text-foreground"
                                      onClick={() => toggleIdx(collKey, connId, dbi.name, c.name)}
                                    >
                                      <ChevronRight
                                        className={cn(
                                          "h-3 w-3 shrink-0 text-muted-foreground/50 transition-transform",
                                          expandedIdx.has(collKey) && "rotate-90"
                                        )}
                                      />
                                      <KeyRound className="h-3.5 w-3.5 shrink-0 text-sky-400/80" />
                                      <span className="flex-1 truncate">{t("sb.indexes")}</span>
                                      <span className="mono text-[10px] text-muted-foreground/60">{c.indexCount || ""}</span>
                                    </div>
                                    {expandedIdx.has(collKey) && (
                                      <div className="ml-[14px] flex flex-col border-l border-border/40 pl-1.5">
                                        {(idxCache[collKey] ?? []).map((idx) => (
                                          <button
                                            key={idx.name}
                                            className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[12px] text-muted-foreground hover:bg-accent hover:text-foreground"
                                            onClick={() => openAction(collAction("indexes"))}
                                          >
                                            <KeyRound className="h-3 w-3 shrink-0 text-sky-400/60" />
                                            <span className="flex-1 truncate">{idx.name}</span>
                                            {idx.unique && (
                                              <span className="text-[9px] uppercase text-amber-500/80">uniq</span>
                                            )}
                                          </button>
                                        ))}
                                        {idxCache[collKey] && idxCache[collKey].length === 0 && (
                                          <div className="px-2 py-1 text-[11px] text-muted-foreground/50">—</div>
                                        )}
                                      </div>
                                    )}
                                    <button
                                      className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[12px] text-muted-foreground hover:bg-accent hover:text-foreground"
                                      onClick={() => openAction(collAction("history"))}
                                    >
                                      <History className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                                      <span className="flex-1 truncate">{t("sb.collHistory")}</span>
                                      {backupCount > 0 && (
                                        <span className="mono rounded bg-muted px-1.5 text-[10px] tabular-nums text-muted-foreground">
                                          {backupCount}
                                        </span>
                                      )}
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          );
        })}

        {open.length === 0 && (
          <div className="px-3 py-8 text-center text-[11px] text-muted-foreground">{t("sb.empty")}</div>
        )}
      </div>

      <div className="border-t border-border p-2">
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-full gap-1.5 text-xs"
          onClick={() => setRoute("connections")}
        >
          <Plus className="h-3.5 w-3.5" /> {t("sb.connectServer")}
        </Button>
      </div>
    </aside>
  );
}

type T = (k: string) => string;

/** Shared collection actions, rendered into either a context menu or dropdown. */
function CollMenuItems({
  openAction,
  action,
  t,
  ItemEl,
  Sep,
}: {
  openAction: (a: CollAction) => void;
  action: (k: CollAction["kind"]) => CollAction;
  t: T;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ItemEl: React.ComponentType<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Sep: React.ComponentType<any>;
}) {
  return (
    <>
      <ItemEl onClick={() => openAction(action("renameColl"))}>
        <Pencil className="mr-2 h-3.5 w-3.5" /> {t("coll.rename")}
      </ItemEl>
      <ItemEl onClick={() => openAction(action("duplicateColl"))}>
        <Copy className="mr-2 h-3.5 w-3.5" /> {t("coll.duplicate")}
      </ItemEl>
      <ItemEl onClick={() => openAction(action("indexes"))}>
        <KeyRound className="mr-2 h-3.5 w-3.5" /> {t("sb.indexes")}
      </ItemEl>
      <ItemEl onClick={() => openAction(action("schema"))}>
        <ListChecks className="mr-2 h-3.5 w-3.5" /> {t("sb.schema")}
      </ItemEl>
      <ItemEl onClick={() => openAction(action("history"))}>
        <History className="mr-2 h-3.5 w-3.5" /> {t("history.title")}
      </ItemEl>
      <Sep />
      <ItemEl className="text-destructive" onClick={() => openAction(action("dropColl"))}>
        <Trash2 className="mr-2 h-3.5 w-3.5" /> {t("sb.dropCollection")}
      </ItemEl>
    </>
  );
}

/** Hover kebab on a collection row (mirrors the right-click menu). */
function CollMenu({
  openAction,
  action,
  t,
}: {
  openAction: (a: CollAction) => void;
  action: (k: CollAction["kind"]) => CollAction;
  t: T;
}) {
  // Defer opening the dialog until after the menu has closed — opening a Radix
  // Dialog while the dropdown is still unmounting leaves pointer-events stuck.
  const deferred = (a: CollAction) => setTimeout(() => openAction(a), 0);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <span
          role="button"
          tabIndex={-1}
          className="grid h-4 w-4 shrink-0 place-items-center rounded text-muted-foreground opacity-0 transition hover:bg-foreground/10 hover:text-foreground group-hover:opacity-100 data-[state=open]:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48" onClick={(e) => e.stopPropagation()}>
        <CollMenuItems openAction={deferred} action={action} t={t} ItemEl={DropdownMenuItem} Sep={DropdownMenuSeparator} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Hover kebab on a server row. */
function ServerMenu({
  onOverview,
  onChooseDbs,
  onNewDb,
  onRefresh,
  onCopyUri,
  onEdit,
  onDisconnect,
  t,
}: {
  onOverview: () => void;
  onChooseDbs: () => void;
  onNewDb: () => void;
  onRefresh: () => void;
  onCopyUri: () => void;
  onEdit?: () => void;
  onDisconnect: () => void;
  t: T;
}) {
  const d = (fn: () => void) => () => setTimeout(fn, 0);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <span
          role="button"
          tabIndex={-1}
          className="grid h-5 w-5 shrink-0 place-items-center rounded text-muted-foreground opacity-0 transition hover:bg-foreground/10 hover:text-foreground group-hover:opacity-100 data-[state=open]:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onClick={d(onOverview)}>
          <Database className="mr-2 h-3.5 w-3.5" /> {t("nav.overview")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={d(onChooseDbs)}>
          <ListChecks className="mr-2 h-3.5 w-3.5" /> {t("sb.chooseDbs")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={d(onNewDb)}>
          <FolderPlus className="mr-2 h-3.5 w-3.5" /> {t("sb.newDatabase")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onRefresh}>
          <RefreshCw className="mr-2 h-3.5 w-3.5" /> {t("common.refresh")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={d(onCopyUri)}>
          <Copy className="mr-2 h-3.5 w-3.5" /> {t("sb.copyUri")}
        </DropdownMenuItem>
        {onEdit && (
          <DropdownMenuItem onClick={d(onEdit)}>
            <Pencil className="mr-2 h-3.5 w-3.5" /> {t("sb.editConnection")}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive" onClick={d(onDisconnect)}>
          <Unplug className="mr-2 h-3.5 w-3.5" /> {t("conn.disconnect")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
