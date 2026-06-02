import { useEffect, useState } from "react";
import { AlertTriangle, KeyRound, Loader2, Plus, Trash2 } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { HistoryPanel } from "@/components/HistoryPanel";
import { ipc } from "@/lib/ipc";
import { useCollActions, type ActionKind } from "@/stores/collActions";
import { useTree } from "@/stores/tree";
import type { IndexInfo } from "@/lib/types";
import { useT } from "@/lib/i18n";

async function refreshTree(connId: string, db?: string) {
  await useTree.getState().loadDatabases(connId);
  if (db) await useTree.getState().loadCollections(connId, db);
}

const PROMPT_TITLE_KEYS: Partial<Record<ActionKind, string>> = {
  renameColl: "ca.renameColl",
  duplicateColl: "coll.duplicate",
  createColl: "sb.newCollection",
  createDb: "sb.newDatabase",
};

export function CollectionActions() {
  const action = useCollActions((s) => s.action);
  const close = useCollActions((s) => s.close);
  const connId = action?.connId ?? null;
  const t = useT();

  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    setBusy(false);
    if (!action) return;
    setValue(
      action.kind === "renameColl"
        ? action.coll ?? ""
        : action.kind === "duplicateColl"
        ? `${action.coll}_copy`
        : ""
    );
  }, [action]);

  if (!action || !connId) return null;

  // ── Indexes & history get dedicated panels ───────────────────────────────
  if (action.kind === "indexes") {
    return <IndexesDialog connId={connId} db={action.db!} coll={action.coll!} onClose={close} />;
  }
  if (action.kind === "history") {
    return <HistoryPanel open connId={connId} db={action.db!} coll={action.coll!} onClose={close} />;
  }

  const isDrop = action.kind === "dropColl" || action.kind === "dropDb";
  const isCreateDb = action.kind === "createDb";

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      switch (action.kind) {
        case "renameColl":
          await ipc.renameCollection(connId, action.db!, action.coll!, value.trim());
          break;
        case "duplicateColl":
          await ipc.duplicateCollection(connId, action.db!, action.coll!, value.trim());
          break;
        case "createColl":
          await ipc.createCollection(connId, action.db!, value.trim());
          break;
        case "createDb":
          // creating a database requires a first collection.
          await ipc.createDatabase(connId, value.trim(), "documents");
          break;
        case "dropColl":
          await ipc.dropCollection(connId, action.db!, action.coll!);
          break;
        case "dropDb":
          await ipc.dropDatabase(connId, action.db!);
          break;
      }
      await refreshTree(connId, action.db);
      close();
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent className="tcn-glass-strong sm:max-w-md">
        <DialogHeader>
          <DialogTitle className={isDrop ? "flex items-center gap-2 text-destructive" : ""}>
            {isDrop && <AlertTriangle className="h-4 w-4" />}
            {isDrop
              ? action.kind === "dropDb"
                ? `${t("ca.dropDbQ")} "${action.db}"?`
                : `${t("ca.dropCollQ")} "${action.coll}"?`
              : t(PROMPT_TITLE_KEYS[action.kind] ?? "")}
          </DialogTitle>
        </DialogHeader>

        {isDrop ? (
          <p className="text-sm text-muted-foreground">
            {t("ca.dropWarn")}
          </p>
        ) : (
          <div className="space-y-1.5 py-1">
            <Label>{isCreateDb ? t("ca.dbName") : t("conn.name")}</Label>
            <Input
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="mono"
              onKeyDown={(e) => e.key === "Enter" && value.trim() && run()}
            />
            {isCreateDb && (
              <p className="text-[11px] text-muted-foreground">
                {t("ca.starter")}
              </p>
            )}
          </div>
        )}

        {error && (
          <div className="mono break-all rounded-md border border-destructive/40 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button
            variant={isDrop ? "destructive" : "default"}
            className={isDrop ? "" : "tcn-accent border-0"}
            onClick={run}
            disabled={busy || (!isDrop && !value.trim())}
          >
            {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {isDrop ? t("ca.drop") : t("common.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Indexes management dialog ──────────────────────────────────────────────────

function IndexesDialog({
  connId,
  db,
  coll,
  onClose,
}: {
  connId: string;
  db: string;
  coll: string;
  onClose: () => void;
}) {
  const t = useT();
  const [indexes, setIndexes] = useState<IndexInfo[]>([]);
  const [keys, setKeys] = useState('{ "field": 1 }');
  const [unique, setUnique] = useState(false);
  const [busy, setBusy] = useState(false);

  const reload = () => ipc.listIndexes(connId, db, coll).then(setIndexes).catch(() => setIndexes([]));
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connId, db, coll]);

  const add = async () => {
    setBusy(true);
    try {
      await ipc.createIndex(connId, db, coll, keys, unique);
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const drop = async (name: string) => {
    await ipc.dropIndex(connId, db, coll, name);
    await reload();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="tcn-glass-strong sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-tucano-400" />
            {t("sb.indexes")} — <span className="mono text-tucano-400">{coll}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="max-h-56 space-y-1 overflow-auto scroll-thin">
          {indexes.map((idx) => (
            <div
              key={idx.name}
              className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs"
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium">{idx.name}</div>
                <div className="mono truncate text-[11px] text-muted-foreground">
                  {JSON.stringify(idx.keys)}
                </div>
              </div>
              {idx.unique && (
                <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-500">
                  {t("ca.unique")}
                </span>
              )}
              {idx.name !== "_id_" && (
                <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => drop(idx.name)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>

        <div className="space-y-2 rounded-md border border-border p-3">
          <Label className="text-xs">{t("ca.newIndex")}</Label>
          <Input value={keys} onChange={(e) => setKeys(e.target.value)} className="mono text-xs" />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs">
              <Switch checked={unique} onCheckedChange={setUnique} /> {t("ca.unique")}
            </label>
            <Button size="sm" className="tcn-accent border-0 text-xs" onClick={add} disabled={busy}>
              <Plus className="mr-1 h-3.5 w-3.5" /> {t("common.create")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
