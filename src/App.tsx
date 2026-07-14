import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
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
import { HtmlPreviewDialog } from "@/components/HtmlPreviewDialog";
import { AiTerminal } from "@/components/AiTerminal";
import { useConnections } from "@/stores/connections";
import { useSettings } from "@/stores/settings";
import { useTabs } from "@/stores/tabs";
import { useTree } from "@/stores/tree";
import { formatQuery } from "@/lib/queryParser";

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

  useEffect(() => {
    let dispose: (() => void) | undefined;
    void listen<{ conn: string; db: string; coll: string; query: string; language: "mongo" | "sql"; execute: boolean }>("tucano://query-draft", async ({ payload }) => {
      const connection = useConnections.getState().list.find((item) => item.id === payload.conn);
      if (!connection) return;
      let query = payload.query;
      try {
        query = formatQuery(payload.language, payload.query);
      } catch {
        // The bridge already validates read queries. Keep the received source
        // if a future dialect cannot be pretty-printed by the local editor.
      }
      const tree = useTree.getState();
      await tree.addServer(payload.conn);
      if (!useTree.getState().trees[payload.conn]?.expandedDbs.has(payload.db)) {
        await useTree.getState().toggleDb(payload.conn, payload.db);
      }
      const tabs = useTabs.getState();
      const existing = tabs.tabs.find((tab) => tab.connId === payload.conn && tab.db === payload.db && tab.coll === payload.coll);
      if (existing) {
        tabs.update(existing.id, { query, lang: payload.language, page: 1, dirty: true });
        tabs.setActive(existing.id);
        if (payload.execute) void tabs.run(existing.id);
      } else {
        const id = tabs.newTab(
          { connId: connection.id, connName: connection.name, connColor: connection.color, db: payload.db },
          payload.coll,
          false,
        );
        tabs.update(id, { query, lang: payload.language, page: 1, dirty: true });
        if (payload.execute) void tabs.run(id);
      }
    }).then((handler) => { dispose = handler; });
    return () => dispose?.();
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
          <AiTerminal />
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
        <HtmlPreviewDialog />
      </div>
    </TooltipProvider>
  );
}
