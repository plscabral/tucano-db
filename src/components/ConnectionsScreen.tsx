import { ArrowRight, Boxes, Bot, Loader2, MoreVertical, Pencil, Plus, Terminal, Trash2, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Display } from "@/components/Display";
import { LogoMark } from "@/components/Logo";
import { useConnections } from "@/stores/connections";
import { useConnDialog } from "@/stores/connDialog";
import { useDbChooser } from "@/components/DatabasesDialog";
import { useTree } from "@/stores/tree";
import { CONN_COLOR_HEX } from "@/lib/types";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const FEATURES = [
  { icon: Boxes, titleKey: "home.feat1.title", descKey: "home.feat1.desc" },
  { icon: Terminal, titleKey: "home.feat2.title", descKey: "home.feat2.desc" },
  { icon: Bot, titleKey: "home.feat3.title", descKey: "home.feat3.desc" },
];

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
      {/* Atmosphere: grid texture, radial brand glow, oversized watermark mark.
          Clipped by the parent's overflow-hidden so they never create scroll. */}
      <div className="tcn-grid pointer-events-none absolute inset-0" />
      <div
        className="pointer-events-none absolute -left-40 -top-40 h-[34rem] w-[34rem] rounded-full opacity-60"
        style={{ background: "radial-gradient(closest-side, rgba(var(--tucano-rgb),0.18), transparent 70%)" }}
      />
      <LogoMark className="pointer-events-none absolute -bottom-32 -right-32 h-[34rem] w-[34rem] opacity-[0.035]" />

      <div className="relative h-full overflow-y-auto overflow-x-hidden scroll-thin">
        <div className="mx-auto flex min-h-full w-full max-w-5xl items-center px-10 py-12">
        <div className="grid w-full items-center gap-x-14 gap-y-12 lg:grid-cols-[1.05fr_0.95fr]">
          {/* ── Hero ─────────────────────────────────────────────── */}
          <div className="min-w-0">
            <div className="tcn-rise mb-7 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground" style={{ animationDelay: "0ms" }}>
              <span className="h-1.5 w-1.5 rounded-full bg-tucano-400 shadow-[0_0_8px_rgba(var(--tucano-rgb),0.9)]" />
              {t("home.eyebrow")}
            </div>

            <div className="relative mb-6 inline-block tcn-rise" style={{ animationDelay: "60ms" }}>
              <div className="tcn-aura absolute -inset-3" />
              <LogoMark className="relative h-16 w-16" />
            </div>

            <h1 className="tcn-rise text-5xl leading-[1.02] tracking-tight" style={{ animationDelay: "120ms" }}>
              <Display lead={t("home.titleLead")} accent={t("home.titleAccent")} tail={t("home.titleTail")} />
            </h1>
            <p className="tcn-rise mt-4 max-w-md text-[15px] leading-relaxed text-muted-foreground" style={{ animationDelay: "180ms" }}>
              {t("home.subtitle")}
            </p>

            <div className="mt-9 flex flex-col">
              {FEATURES.map((f, i) => (
                <div
                  key={f.titleKey}
                  className="tcn-rise group flex items-start gap-4 border-t border-border/60 py-4 first:border-t-0"
                  style={{ animationDelay: `${240 + i * 70}ms` }}
                >
                  <span className="mono mt-0.5 text-[11px] tabular-nums text-tucano-400/70">
                    0{i + 1}
                  </span>
                  <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg tcn-accent-soft ring-1 ring-inset ring-tucano-400/20 transition group-hover:ring-tucano-400/50">
                    <f.icon className="h-4 w-4 text-tucano-400" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{t(f.titleKey)}</div>
                    <div className="text-[13px] leading-relaxed text-muted-foreground">{t(f.descKey)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Connections console ──────────────────────────────── */}
          <div className="tcn-rise min-w-0" style={{ animationDelay: "320ms" }}>
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
                  <div className="flex flex-col gap-1.5">
                    {list.map((c) => {
                      const isActive = active.has(c.id);
                      const isBusy = busyId === c.id;
                      const hex = CONN_COLOR_HEX[c.color];
                      return (
                        <div
                          key={c.id}
                          className="group relative overflow-hidden rounded-xl border border-border bg-card/60 p-4 transition hover:border-tucano-400/40 hover:bg-card"
                        >
                          <span className="absolute inset-y-0 left-0 w-1" style={{ background: hex }} />

                          <div className="flex items-center gap-2.5">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ background: hex, boxShadow: `0 0 8px ${hex}99` }}
                            />
                            <span className="truncate text-sm font-semibold">{c.name}</span>
                            {isActive && (
                              <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-500">
                                <span className="h-1 w-1 rounded-full bg-emerald-500" /> live
                              </span>
                            )}
                            <div className="flex-1" />
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

                          <div className="mono mt-1.5 truncate pl-[1.25rem] text-[11px] text-muted-foreground">
                            {c.uri.replace(/:\/\/[^@]*@/, "://•••@")}
                          </div>

                          <Button
                            className={cn(
                              "mt-3 h-9 w-full gap-1.5 border-0 text-xs",
                              isActive ? "tcn-accent tcn-accent-glow" : "tcn-neon"
                            )}
                            onClick={() => handleConnect(c.id)}
                            disabled={isBusy}
                          >
                            {isBusy ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <>
                                {isActive ? t("nav.databases") : t("conn.connect")}
                                <ArrowRight className="h-3.5 w-3.5" />
                              </>
                            )}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <p className="mono mt-3 px-1 text-center text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50">
              {t("app.tagline")}
            </p>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
