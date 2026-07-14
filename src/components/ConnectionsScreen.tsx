import { useMemo, useState } from "react";
import { ArrowRight, Loader2, MoreVertical, Pencil, Plus, Search, Trash2, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useConnections } from "@/stores/connections";
import { useConnDialog } from "@/stores/connDialog";
import { useDbChooser } from "@/components/DatabasesDialog";
import { useTree } from "@/stores/tree";
import { CONN_COLOR_HEX } from "@/lib/types";
import { useT } from "@/lib/i18n";

export function ConnectionsScreen() {
  const t = useT();
  const list = useConnections((s) => s.list);
  const active = useConnections((s) => s.active);
  const busyId = useConnections((s) => s.busyId);
  const error = useConnections((s) => s.error);
  const connect = useConnections((s) => s.connect);
  const disconnect = useConnections((s) => s.disconnect);
  const remove = useConnections((s) => s.remove);
  const addServer = useTree((s) => s.addServer);
  const openNew = useConnDialog((s) => s.openNew);
  const openEdit = useConnDialog((s) => s.openEdit);
  const openDbChooser = useDbChooser((s) => s.open);
  const [search, setSearch] = useState("");
  const visibleConnections = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return [...list]
      .filter((connection) => !query || `${connection.name} ${connection.environment} ${connection.uri}`.toLocaleLowerCase().includes(query))
      .sort((a, b) => Number(active.has(b.id)) - Number(active.has(a.id)) || (b.lastConnected ?? 0) - (a.lastConnected ?? 0) || a.name.localeCompare(b.name));
  }, [active, list, search]);

  const handleConnect = async (id: string) => {
    if (active.has(id)) return addServer(id);
    const ok = await connect(id);
    if (!ok) return;
    await addServer(id);
    // First time on this connection: let the user pick which databases to show.
    const conn = list.find((c) => c.id === id);
    if (conn && conn.visibleDbs.length === 0) openDbChooser(id);
  };

  return (
    <div className="relative h-full w-full flex-1 overflow-hidden">
      <div className="relative h-full overflow-y-auto overflow-x-hidden scroll-thin">
        <div className="mx-auto w-full max-w-4xl px-6 py-8 sm:px-10">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <p className="mono text-[10px] font-semibold uppercase tracking-[0.18em] text-tucano-400">Workspace</p>
              <h1 className="mt-1 text-xl font-semibold tracking-tight">Connections</h1>
              <p className="mt-1 text-sm text-muted-foreground">Open a database or add a saved connection.</p>
            </div>
          </div>
          <div className="min-w-0">
            <div className="tcn-glass-strong overflow-hidden rounded-2xl border border-border shadow-elev">
              <div className="tcn-sheen flex items-center justify-between border-b border-border/70 px-5 py-3.5">
                <div className="flex items-center gap-2">
                  <span className="mono text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {t("conn.title")}
                  </span>
                  {list.length > 0 && (
                    <span className="mono rounded-full bg-muted px-1.5 text-[10px] tabular-nums text-muted-foreground">
                      {list.length}
                    </span>
                  )}
                </div>
                <Button
                  size="sm"
                  className="tcn-accent tcn-accent-glow h-8 gap-1.5 border-0 text-xs"
                  onClick={openNew}
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t("conn.new")}
                </Button>
              </div>

              <div className="p-3">
                {error && (
                  <div className="mb-3 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                    {error}
                  </div>
                )}

                {list.length === 0 ? (
                  <button
                    onClick={openNew}
                    className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-14 text-center transition hover:border-tucano-400/50 hover:bg-tucano-400/[0.03]"
                  >
                    <Plus className="h-5 w-5 text-tucano-400" />
                    <span className="text-sm font-medium">{t("conn.new")}</span>
                    <span className="text-xs text-muted-foreground">{t("conn.empty")}</span>
                  </button>
                ) : (
                  <>
                    <label className="mb-2 flex h-9 items-center gap-2 rounded-lg border border-border bg-muted/35 px-2.5 focus-within:border-tucano-400/60 focus-within:ring-2 focus-within:ring-tucano-400/10">
                      <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search connections" className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground" />
                      <span className="mono text-[10px] text-muted-foreground">{visibleConnections.length}/{list.length}</span>
                    </label>
                    <div className="max-h-[min(52dvh,34rem)] space-y-1 overflow-y-auto pr-1 scroll-thin">
                    {visibleConnections.map((c) => {
                      const isActive = active.has(c.id);
                      const isBusy = busyId === c.id;
                      const hex = CONN_COLOR_HEX[c.color];
                      return (
                        <div
                          key={c.id}
                          className="group relative flex items-center gap-2.5 rounded-lg border border-transparent px-2.5 py-2 transition hover:border-tucano-400/35 hover:bg-muted/45"
                        >
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: hex, boxShadow: `0 0 8px ${hex}99` }} />
                          <button onClick={() => handleConnect(c.id)} disabled={isBusy} className="min-w-0 flex-1 text-left disabled:opacity-60">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate text-[13px] font-semibold">{c.name}</span>
                              <span className="rounded bg-muted px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">{c.environment.slice(0, 3)}</span>
                            {isActive && (
                              <span className="flex shrink-0 items-center gap-1 text-[10px] font-medium text-emerald-500">
                                <span className="h-1 w-1 rounded-full bg-emerald-500" /> live
                              </span>
                            )}
                            </div>
                            <div className="mono mt-0.5 truncate text-[10px] text-muted-foreground">{c.uri.replace(/:\/\/[^@]*@/, "://•••@")}</div>
                          </button>
                          {isBusy ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-tucano-400" /> : (
                            <button onClick={() => handleConnect(c.id)} className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground transition hover:bg-tucano-400/10 hover:text-tucano-400" title={isActive ? t("nav.databases") : t("conn.connect")}><ArrowRight className="h-3.5 w-3.5" /></button>
                          )}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground">
                                  <MoreVertical className="h-3.5 w-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => openEdit(c)}>
                                  <Pencil className="mr-2 h-3.5 w-3.5" /> {t("sb.editConnection")}
                                </DropdownMenuItem>
                                {isActive && (
                                  <DropdownMenuItem onClick={() => disconnect(c.id)}>
                                    <Unplug className="mr-2 h-3.5 w-3.5" /> {t("conn.disconnect")}
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-destructive" onClick={() => remove(c.id)}>
                                  <Trash2 className="mr-2 h-3.5 w-3.5" /> {t("doc.delete")}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                      );
                    })}
                    {visibleConnections.length === 0 && <div className="px-3 py-10 text-center text-xs text-muted-foreground">No connections match your search.</div>}
                    </div>
                  </>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
