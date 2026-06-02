import { Bookmark, Clock, Database } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Sidebar } from "@/components/Sidebar";
import { SavedQueriesPanel } from "@/components/SavedQueriesPanel";
import { QueryHistoryPanel } from "@/components/QueryHistoryPanel";
import { useLeftPanel, type LeftView } from "@/stores/leftPanel";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function LeftPane() {
  const view = useLeftPanel((s) => s.view);
  const setView = useLeftPanel((s) => s.setView);
  const t = useT();

  const items: { id: LeftView; icon: typeof Database; label: string }[] = [
    { id: "tree", icon: Database, label: t("sb.servers") },
    { id: "saved", icon: Bookmark, label: t("query.saved") },
    { id: "history", icon: Clock, label: t("history.title") },
  ];

  return (
    <div className="tcn-glass flex h-full w-full min-w-0 border-r">
      {/* Activity rail */}
      <div className="flex w-11 shrink-0 flex-col items-center gap-1 border-r border-border/60 py-2">
        {items.map((it) => (
          <Tooltip key={it.id}>
            <TooltipTrigger asChild>
              <button
                onClick={() => setView(it.id)}
                className={cn(
                  "relative grid h-9 w-9 place-items-center rounded-lg transition",
                  view === it.id
                    ? "tcn-accent-soft text-tucano-700 dark:text-tucano-300"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                {view === it.id && (
                  <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-tucano-400" />
                )}
                <it.icon className="h-[18px] w-[18px]" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{it.label}</TooltipContent>
          </Tooltip>
        ))}
      </div>

      {/* Active panel */}
      <div className="min-w-0 flex-1">
        {view === "tree" && <Sidebar />}
        {view === "saved" && <SavedQueriesPanel />}
        {view === "history" && <QueryHistoryPanel />}
      </div>
    </div>
  );
}
