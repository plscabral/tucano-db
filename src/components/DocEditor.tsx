import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Save } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RawEditor } from "@/viewers/RawEditor";
import { useDocActions } from "@/stores/docActions";
import { useTabs, useActiveTab } from "@/stores/tabs";
import { useTree } from "@/stores/tree";
import { ipc } from "@/lib/ipc";
import { useT } from "@/lib/i18n";

const TITLES: Record<string, string> = {
  edit: "doc.edit",
  insert: "doc.insert",
  duplicate: "doc.duplicate",
};

function refresh() {
  const tabs = useTabs.getState();
  const tab = tabs.tabs.find((t) => t.id === tabs.activeId);
  if (tab) {
    tabs.run(tab.id);
    useTree.getState().loadCollections(tab.connId, tab.db);
  }
}

export function DocEditor() {
  const t = useT();
  const editor = useDocActions((s) => s.editor);
  const close = useDocActions((s) => s.closeEditor);
  const activeTab = useActiveTab();
  const connId = activeTab?.connId ?? null;
  const db = activeTab?.db ?? null;
  const coll = activeTab?.coll ?? null;

  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editor) {
      setDraft(editor.json);
      setError(null);
    }
  }, [editor]);

  if (!editor) return null;

  const save = async () => {
    try {
      JSON.parse(draft); // fail fast on malformed JSON
    } catch (e) {
      setError(`Invalid JSON: ${e}`);
      return;
    }
    if (!connId || !db || !coll) return;
    setBusy(true);
    setError(null);
    try {
      if (editor.mode === "edit") {
        await ipc.updateDocument(connId, db, coll, draft);
      } else {
        await ipc.insertDocument(connId, db, coll, draft);
      }
      refresh();
      close();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent className="tcn-glass-strong sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="mono text-sm">
            {t(TITLES[editor.mode])} — <span className="text-tucano-400">{coll}</span>
          </DialogTitle>
        </DialogHeader>

        <RawEditor value={draft} onChange={setDraft} minHeight={360} />

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 px-3 py-2 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="mono break-all">{error}</span>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button className="tcn-accent border-0" onClick={save} disabled={busy}>
            {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
            {t("set.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteDocDialog() {
  const t = useT();
  const deleting = useDocActions((s) => s.deleting);
  const close = useDocActions((s) => s.closeDelete);
  const activeTab = useActiveTab();
  const connId = activeTab?.connId ?? null;
  const db = activeTab?.db ?? null;
  const coll = activeTab?.coll ?? null;
  const [busy, setBusy] = useState(false);

  if (!deleting) return null;

  const confirm = async () => {
    if (!connId || !db || !coll) return;
    setBusy(true);
    try {
      await ipc.deleteDocument(connId, db, coll, deleting.idJson);
      refresh();
      close();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent className="tcn-glass-strong sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" />
            {t("doc.delete")}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{t("doc.deleteConfirm")}</p>
        <p className="mono truncate rounded bg-muted px-2 py-1 text-xs">{deleting.label}</p>
        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={busy}>
            {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {t("doc.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
