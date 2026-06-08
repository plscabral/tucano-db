import { useEffect, useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { TopBar } from "@/components/TopBar";
import { StatusBar } from "@/components/StatusBar";
import { LeftPane } from "@/components/LeftPane";
import { ConnectionsScreen } from "@/components/ConnectionsScreen";
import { ConnectionDialog } from "@/components/ConnectionDialog";
import { Workspace } from "@/components/Workspace";
import { Overview } from "@/components/Overview";
import { Settings } from "@/components/Settings";
import { DocEditor, DeleteDocDialog } from "@/components/DocEditor";
import { CollectionActions } from "@/components/CollectionActions";
import { QueryHistoryDialog } from "@/components/QueryHistoryDialog";
import { DatabasesDialog } from "@/components/DatabasesDialog";
import { SaveQueryDialog, useSaveDialog } from "@/components/SaveQueryDialog";
import { ExportDialog } from "@/components/ExportDialog";
import { useConnections } from "@/stores/connections";
import { useSettings } from "@/stores/settings";
import { useTabs } from "@/stores/tabs";
import { useTree } from "@/stores/tree";

export default function App() {
  const route = useTree((s) => s.route);
  const loadConnections = useConnections((s) => s.load);
  const loadSettings = useSettings((s) => s.load);
  const settings = useSettings((s) => s.settings);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    loadSettings();
    loadConnections();
  }, [loadSettings, loadConnections]);

  // Keep tab defaults in sync with settings.
  useEffect(() => {
    const tabs = useTabs.getState();
    tabs.setDefaultPageSize(settings.defaultPageSize);
    tabs.setAutoExecute(settings.autoExecute);
    tabs.setInitialScript(settings.initialScript);
  }, [settings.defaultPageSize, settings.autoExecute, settings.initialScript]);

  // Global shortcuts: ⌘R re-runs the active query; ⌘S saves it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      if (key === "r") {
        e.preventDefault();
        const { activeId, run } = useTabs.getState();
        if (activeId) run(activeId);
      } else if (key === "s") {
        e.preventDefault();
        const { activeId } = useTabs.getState();
        if (activeId) useSaveDialog.getState().open(activeId);
      } else if (e.key === ",") {
        e.preventDefault();
        setSettingsOpen(true);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-full flex-col bg-background text-foreground">
        <TopBar onOpenSettings={() => setSettingsOpen(true)} />

        <div className="flex flex-1 overflow-hidden">
          {route === "connections" ? (
            <ConnectionsScreen />
          ) : (
            <ResizablePanelGroup direction="horizontal" autoSaveId="tucano-db:sidebar" className="flex-1">
              <ResizablePanel defaultSize={22} minSize={14} maxSize={42} className="flex">
                <LeftPane />
              </ResizablePanel>
              <ResizableHandle className="transition-colors hover:bg-tucano-400/50" />
              <ResizablePanel defaultSize={80} minSize={40} className="flex">
                {route === "overview" ? <Overview /> : <Workspace />}
              </ResizablePanel>
            </ResizablePanelGroup>
          )}
        </div>

        <StatusBar />

        {/* Global dialogs */}
        <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
        <ConnectionDialog />
        <DocEditor />
        <DeleteDocDialog />
        <CollectionActions />
        <QueryHistoryDialog />
        <DatabasesDialog />
        <SaveQueryDialog />
        <ExportDialog />
      </div>
    </TooltipProvider>
  );
}
