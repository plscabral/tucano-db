import { useEffect, useState } from "react";
import { Bot, Layers, Server } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ipc } from "@/lib/ipc";
import { useTree } from "@/stores/tree";
import { useActiveTab } from "@/stores/tabs";
import { formatCount } from "@/lib/bsonTypes";
import { useT } from "@/lib/i18n";

const Divider = () => <span className="h-3.5 w-px bg-foreground/10 dark:bg-white/10" />;

export function StatusBar() {
  const t = useT();
  const servers = useTree((s) => s.open.length);
  const tab = useActiveTab();
  const [mcp, setMcp] = useState<{ enabled: boolean; port: number } | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      ipc
        .getMcpSettings()
        .then((m) => alive && setMcp({ enabled: m.enabled, port: m.port }))
        .catch(() => {});
    load();
    const onChange = () => load();
    window.addEventListener("tucano:mcp-changed", onChange);
    return () => {
      alive = false;
      window.removeEventListener("tucano:mcp-changed", onChange);
    };
  }, []);

  return (
    <footer
      className="tcn-glass relative flex h-9 items-center gap-2.5 border-t border-ink-100/60 px-4 text-[11px] text-foreground/70 dark:border-white/[0.07] dark:text-ink-100
        before:pointer-events-none before:absolute before:inset-x-0 before:-top-px before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/[0.08] before:to-transparent"
    >
      <span className="absolute left-1/2 flex -translate-x-1/2 select-none items-center gap-1.5 text-[11px] opacity-40">
        <span className="h-1 w-1 rounded-full bg-tucano-400/70" />
        {t("app.tagline")}
      </span>

      <Tooltip>
        <TooltipTrigger asChild>
          <span className="flex h-6 cursor-default items-center gap-1.5 rounded-md px-1.5 transition hover:bg-ink-100/60 dark:hover:bg-white/[0.05]">
            <Server size={12} className="opacity-55" />
            <span className="mono font-semibold tabular-nums text-tucano-300">{servers}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">{t("sb.connected")}</TooltipContent>
      </Tooltip>

      {tab?.result && (
        <>
          <Divider />
          <span className="flex items-center gap-1.5">
            <Layers size={12} className="opacity-55" />
            <span className="mono tabular-nums">
              {formatCount(tab.result.filteredCount)} {t("page.filtered")}
            </span>
          </span>
        </>
      )}

      <div className="flex-1" />

      <Tooltip>
        <TooltipTrigger asChild>
          <span className="relative grid h-6 w-6 cursor-default place-items-center rounded-md opacity-75 transition hover:bg-ink-100/60 hover:opacity-100 dark:hover:bg-white/[0.05]">
            <Bot size={13} />
            <span
              className={`absolute -bottom-px -right-px h-1.5 w-1.5 rounded-full ring-2 ring-[var(--tcn-canvas)] ${
                mcp?.enabled ? "bg-emerald-400 shadow-[0_0_7px_rgb(52_211_153_/_0.7)]" : "bg-ink-300/60 dark:bg-white/20"
              }`}
            />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="mono text-[11px]">
          {mcp?.enabled ? <>MCP: 127.0.0.1:{mcp.port}</> : <>MCP: {t("refresh.off")}</>}
        </TooltipContent>
      </Tooltip>
    </footer>
  );
}
