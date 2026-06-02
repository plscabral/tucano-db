import { create } from "zustand";
import { useEffect, useState } from "react";
import { Bookmark } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTabs } from "@/stores/tabs";
import { useSavedQueries } from "@/stores/savedQueries";
import { useT } from "@/lib/i18n";

type DialogState = { tabId: string | null; open: (tabId: string) => void; close: () => void };
export const useSaveDialog = create<DialogState>((set) => ({
  tabId: null,
  open: (tabId) => set({ tabId }),
  close: () => set({ tabId: null }),
}));

export function SaveQueryDialog() {
  const t = useT();
  const tabId = useSaveDialog((s) => s.tabId);
  const close = useSaveDialog((s) => s.close);
  const tabs = useTabs((s) => s.tabs);
  const markSaved = useTabs((s) => s.markSaved);
  const save = useSavedQueries((s) => s.save);
  const tab = tabs.find((t) => t.id === tabId);
  const [name, setName] = useState("");

  useEffect(() => {
    if (tab) setName(tab.coll ?? "query");
  }, [tabId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!tab) return null;

  const confirm = () => {
    const n = name.trim();
    if (!n) return;
    save({ name: n, lang: tab.lang, query: tab.query, connId: tab.connId, db: tab.db, coll: tab.coll });
    markSaved(tab.id);
    close();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent className="tcn-glass-strong sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bookmark className="h-4 w-4 text-tucano-400" />
            {t("query.saveCurrent")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5 py-1">
          <Label>{t("conn.name")}</Label>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && confirm()}
          />
          <p className="mono truncate text-[11px] text-muted-foreground">{tab.query.replace(/\s+/g, " ")}</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            {t("common.cancel")}
          </Button>
          <Button className="tcn-accent border-0" onClick={confirm} disabled={!name.trim()}>
            {t("set.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
