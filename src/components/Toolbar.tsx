import { Braces, FileDown, FileStack, ListTree, Plus, RefreshCw, Table2, Timer } from "lucide-react";
import { save } from "@tauri-apps/plugin-dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTabs, type Tab } from "@/stores/tabs";
import { useAutoRefresh, REFRESH_PRESETS } from "@/stores/autorefresh";
import { useDocActions } from "@/stores/docActions";
import { ipc } from "@/lib/ipc";
import { parseQuery } from "@/lib/queryParser";
import type { ExportFormat, ViewMode } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

const VIEWS: { mode: ViewMode; icon: typeof ListTree; key: string }[] = [
  { mode: "tree", icon: ListTree, key: "view.tree" },
  { mode: "table", icon: Table2, key: "view.table" },
  { mode: "json", icon: Braces, key: "view.json" },
];

export function Toolbar({ tab }: { tab: Tab }) {
  const t = useT();
  const setViewMode = useTabs((s) => s.setViewMode);
  const run = useTabs((s) => s.run);
  const openEditor = useDocActions((s) => s.openEditor);
  const { enabled, intervalMs, setEnabled, setIntervalMs } = useAutoRefresh();

  const doExport = async (format: ExportFormat) => {
    if (!tab.coll) return;
    let filter = "{}";
    let sort = "";
    try {
      const parsed = parseQuery(tab.query);
      if (parsed.kind === "find") {
        filter = parsed.filter;
        sort = parsed.sort;
      }
    } catch {
      /* fall back to all docs */
    }
    const path = await save({
      defaultPath: `${tab.coll}.${format}`,
      filters: [{ name: format.toUpperCase(), extensions: [format] }],
    });
    if (!path) return;
    await ipc.exportDocuments({
      connId: tab.connId,
      db: tab.db,
      coll: tab.coll,
      filter,
      sort,
      limit: 100000,
      format,
      path,
    });
  };

  return (
    <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border bg-card px-3">
      <FileStack className="h-4 w-4 shrink-0 text-tucano-400/80" />
      <span className="mono truncate text-[13px] font-semibold">{tab.coll ?? "query"}</span>
      <span className="mono hidden truncate text-[11px] text-muted-foreground/60 sm:block">
        {tab.connName} · {tab.db}
      </span>

      <div className="flex-1" />

      {/* View switch */}
      <div className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
        {VIEWS.map((v) => (
          <Tooltip key={v.mode}>
            <TooltipTrigger asChild>
              <button
                onClick={() => setViewMode(tab.id, v.mode)}
                className={cn(
                  "grid h-6 w-7 place-items-center rounded-md transition",
                  tab.viewMode === v.mode
                    ? "bg-card text-tucano-600 shadow-sm dark:text-tucano-300"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <v.icon className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{t(v.key)}</TooltipContent>
          </Tooltip>
        ))}
      </div>

      <Divider />

      {/* Data actions */}
      <ToolBtn icon={<RefreshCw className={cn("h-3.5 w-3.5", tab.loading && "animate-spin")} />} label={`${t("common.refresh")} · ⌘R`} onClick={() => run(tab.id)} />

      <Popover>
        <PopoverTrigger asChild>
          <button
            className={cn(
              "grid h-7 w-7 place-items-center rounded-md transition hover:bg-accent",
              enabled ? "text-tucano-500 dark:text-tucano-300" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Timer className="h-3.5 w-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="tcn-glass-strong w-56" align="end">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-medium">{t("refresh.auto")}</span>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
          <div className="grid grid-cols-5 gap-1">
            {REFRESH_PRESETS.map((p) => (
              <button
                key={p.ms}
                onClick={() => setIntervalMs(p.ms)}
                className={cn(
                  "rounded-md border px-1 py-1 text-[11px] transition",
                  intervalMs === p.ms
                    ? "border-tucano-400 text-tucano-500 dark:text-tucano-300"
                    : "border-border text-muted-foreground hover:border-tucano-400/40"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            disabled={!tab.coll}
            title={t("common.export")}
            className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-40"
          >
            <FileDown className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => doExport("json")}>Export JSON</DropdownMenuItem>
          <DropdownMenuItem onClick={() => doExport("csv")}>Export CSV</DropdownMenuItem>
          <DropdownMenuItem onClick={() => doExport("xlsx")}>Export XLSX</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Divider />

      {/* Highlighted insert action — same style as Run, kept last. */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            disabled={!tab.coll}
            onClick={() => openEditor("insert", "{\n  \n}")}
            className="tcn-accent-soft h-7 gap-1 px-2.5 text-xs font-medium text-tucano-700 transition hover:brightness-110 disabled:opacity-40 dark:text-tucano-300"
          >
            <Plus className="h-3.5 w-3.5" /> {t("doc.insertShort")}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t("doc.insert")}</TooltipContent>
      </Tooltip>
    </div>
  );
}

function Divider() {
  return <span className="mx-0.5 h-5 w-px shrink-0 bg-border" />;
}

function ToolBtn({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          disabled={disabled}
          className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-40"
        >
          {icon}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
