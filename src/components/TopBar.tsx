import { AlertTriangle, Database, Gauge, LockKeyhole, Monitor, Moon, Plug, Settings as Cog, Sun } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogoMark } from "@/components/Logo";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTheme, toggleTheme } from "@/stores/theme";
import { useTree } from "@/stores/tree";
import { useConnections } from "@/stores/connections";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

export function TopBar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const mode = useTheme((s) => s.mode);
  const route = useTree((s) => s.route);
  const setRoute = useTree((s) => s.setRoute);
  const open = useTree((s) => s.open);
  const t = useT();
  const connections = useConnections((s) => s.list);
  const active = useConnections((s) => s.active);
  const guarded = connections.find((connection) => active.has(connection.id) && (connection.environment === "production" || connection.readOnly));

  const ThemeIcon = mode === "dark" ? Moon : mode === "light" ? Sun : Monitor;
  // Nav (Databases / Overview / Connections) only makes sense once the user is
  // inside a server — never on the start screen, to avoid confusion.
  const showNav = open.length > 0 && route !== "connections";

  // Drag from the bar (except over controls); double-click maximizes.
  const isInteractive = (el: EventTarget | null) =>
    el instanceof Element && !!el.closest("button, a, input, [role='switch'], [data-no-drag]");
  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || isInteractive(e.target)) return;
    getCurrentWindow().startDragging().catch(() => {});
  };
  const onDoubleClick = (e: React.MouseEvent) => {
    if (isInteractive(e.target)) return;
    getCurrentWindow().toggleMaximize().catch(() => {});
  };

  return (
    <header
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      style={{ paddingTop: IS_MAC ? 42 : 12, paddingBottom: 12 }}
      className="tcn-glass relative flex select-none items-center gap-3 border-b border-ink-100/40 px-[18px] dark:border-white/[0.06]
        after:pointer-events-none after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-gradient-to-r after:from-tucano-400/80 after:via-tucano-400/30 after:to-transparent"
    >
      {/* Brand — bare mark (no square), like Tucano Proxy. */}
      <LogoMark className="h-8 w-8 shrink-0" />
      <div className="shrink-0 text-[16px] leading-none">
        <span className="font-extrabold tracking-tight">Tucano</span>{" "}
        <span className="font-accent text-[17px] font-medium text-tucano-400">DB</span>
      </div>

      {guarded && (
        <div
          className={cn(
            "flex min-w-0 items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px] font-bold uppercase tracking-wide",
            guarded.environment === "production"
              ? "border-amber-500/45 bg-amber-500/10 text-amber-700 dark:text-amber-300"
              : "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300"
          )}
          title={`${guarded.name}: ${guarded.environment}${guarded.readOnly ? ", read-only" : ""}`}
        >
          {guarded.environment === "production" ? <AlertTriangle size={12} /> : <LockKeyhole size={12} />}
          <span className="max-w-32 truncate">{guarded.environment}</span>
          {guarded.readOnly && <LockKeyhole size={11} />}
        </div>
      )}

      <div className="h-full flex-1" />

      {/* Primary nav cluster — only with at least one connected server. */}
      {showNav && (
        <div className="flex shrink-0 items-center gap-0.5 rounded-xl bg-ink-50/50 p-0.5 ring-1 ring-inset ring-ink-100 dark:bg-white/[0.02] dark:ring-white/[0.07]">
          <NavButton
            active={route === "browse"}
            icon={<Database size={15} />}
            label={t("nav.databases")}
            onClick={() => setRoute("browse")}
          />
          <NavButton
            active={route === "overview"}
            icon={<Gauge size={15} />}
            label={t("nav.overview")}
            onClick={() => setRoute("overview")}
          />
        </div>
      )}

      {/* Grouped secondary controls. */}
      <div className="flex shrink-0 items-center gap-0.5 rounded-xl bg-ink-50/50 p-0.5 ring-1 ring-inset ring-ink-100 dark:bg-white/[0.02] dark:ring-white/[0.07]">
        {showNav && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setRoute("connections")}
                className="grid h-8 w-8 place-items-center rounded-lg opacity-75 transition hover:bg-ink-100/70 hover:opacity-100 dark:hover:bg-white/[0.06]"
              >
                <Plug size={15} />
              </button>
            </TooltipTrigger>
            <TooltipContent>{t("conn.title")}</TooltipContent>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={toggleTheme}
              className="grid h-8 w-8 place-items-center rounded-lg opacity-75 transition hover:bg-ink-100/70 hover:opacity-100 dark:hover:bg-white/[0.06]"
            >
              <ThemeIcon size={15} />
            </button>
          </TooltipTrigger>
          <TooltipContent className="capitalize">{mode}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onOpenSettings}
              className="grid h-8 w-8 place-items-center rounded-lg opacity-75 transition hover:bg-ink-100/70 hover:opacity-100 dark:hover:bg-white/[0.06]"
            >
              <Cog size={15} />
            </button>
          </TooltipTrigger>
          <TooltipContent>{t("settings.title")}</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}

function NavButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition",
        active
          ? "tcn-accent-soft text-tucano-700 dark:text-tucano-300"
          : "opacity-75 hover:bg-ink-100/70 hover:opacity-100 dark:hover:bg-white/[0.06]"
      )}
    >
      {icon}
      {label}
    </button>
  );
}
