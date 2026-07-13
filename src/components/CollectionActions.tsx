import { useEffect, useState } from "react";
import { AlertTriangle, KeyRound, ListChecks, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
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
import type { IndexInfo, SchemaAnalysis } from "@/lib/types";
import { useT } from "@/lib/i18n";
import { toShellLiteral } from "@/lib/queryParser";

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
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    setBusy(false);
    setConfirmation("");
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
  if (action.kind === "schema") {
    return <SchemaDialog connId={connId} db={action.db!} coll={action.coll!} onClose={close} />;
  }
  if (action.kind === "history") {
    return <HistoryPanel open connId={connId} db={action.db!} coll={action.coll!} onClose={close} />;
  }

  const isDrop = action.kind === "dropColl" || action.kind === "dropDb";
  const isCreateDb = action.kind === "createDb";
  const dropTarget = action.kind === "dropDb" ? action.db! : action.coll!;

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
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t("ca.dropWarn")}</p>
            <div className="space-y-1.5">
              <Label>Type <span className="mono text-foreground">{dropTarget}</span> to confirm</Label>
              <Input autoFocus value={confirmation} onChange={(e) => setConfirmation(e.currentTarget.value)} className="mono" />
            </div>
          </div>
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
            disabled={busy || (isDrop ? confirmation !== dropTarget : !value.trim())}
          >
            {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {isDrop ? t("ca.drop") : t("common.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Schema analysis dialog ────────────────────────────────────────────────────

function valuePreview(value: unknown): string {
  if (typeof value === "string") return value;
  const text = JSON.stringify(value);
  return text === undefined ? String(value) : text;
}

function SchemaDialog({
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
  const [analysis, setAnalysis] = useState<SchemaAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      setAnalysis(await ipc.analyzeSchema(connId, db, coll));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connId, db, coll]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="tcn-glass-strong flex h-[min(82dvh,46rem)] max-h-[calc(100dvh-2rem)] flex-col gap-4 overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-tucano-400" />
            {t("schema.title")} — <span className="mono text-tucano-400">{coll}</span>
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="grid min-h-0 flex-1 place-items-center">
            <Loader2 className="h-5 w-5 animate-spin text-tucano-400" />
          </div>
        )}

        {error && (
          <div className="min-h-0 flex-1 overflow-auto mono break-all rounded-md border border-destructive/40 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        {!loading && !error && analysis && (
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 scroll-thin">
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-md border border-border bg-muted/50 px-2 py-1">
                <strong>{analysis.sampledDocuments}</strong> {t("schema.sampled")}
              </span>
              <span className="rounded-md border border-border bg-muted/50 px-2 py-1">
                <strong>{analysis.fields.length}</strong> {t("schema.fields")}
              </span>
              <span className="rounded-md border border-border bg-muted/50 px-2 py-1">
                <strong>{analysis.indexes.length}</strong> {t("sb.indexes").toLowerCase()}
              </span>
            </div>

            <section className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">{t("schema.fields")}</div>
              <div className="overflow-hidden rounded-md border border-border">
                {analysis.fields.map((field) => {
                  const optional = field.present < analysis.sampledDocuments;
                  return (
                    <div key={field.path} className="border-b border-border px-3 py-2 last:border-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="mono font-medium text-[12px]">{field.path}</span>
                        {field.types.map((type) => (
                          <span key={type} className="rounded bg-tucano-400/10 px-1.5 py-0.5 text-[10px] text-tucano-700 dark:text-tucano-300">
                            {type}
                          </span>
                        ))}
                        <span className="ml-auto text-[10px] text-muted-foreground">
                          {field.present}/{analysis.sampledDocuments} {t("schema.present")}
                          {optional && ` · ${t("schema.optional")}`}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {field.indexNames.map((index) => (
                          <span key={index} className="rounded bg-sky-500/10 px-1.5 py-0.5 text-[10px] text-sky-600 dark:text-sky-300">
                            {t("schema.indexed")}: {index}
                          </span>
                        ))}
                        {field.sampleValues.map((value, index) => (
                          <code key={index} className="max-w-full truncate rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            {valuePreview(value)}
                          </code>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {analysis.fields.length === 0 && (
                  <div className="px-3 py-8 text-center text-xs text-muted-foreground">{t("schema.empty")}</div>
                )}
              </div>
            </section>

            <section className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">{t("sb.indexes")}</div>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {analysis.indexes.map((index) => (
                  <div key={index.name} className="rounded-md border border-border px-3 py-2 text-xs">
                    <div className="flex items-center gap-1.5 font-medium">
                      <KeyRound className="h-3 w-3 text-sky-400" /> {index.name}
                      {index.unique && <span className="ml-auto text-[10px] text-amber-500">{t("ca.unique")}</span>}
                      {index.sparse && <span className="text-[10px] text-muted-foreground">sparse</span>}
                    </div>
                    <code className="mt-1 block truncate text-[10px] text-muted-foreground">{valuePreview(index.keys)}</code>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        <DialogFooter className="shrink-0 border-t border-border pt-3">
          <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> {t("common.refresh")}
          </Button>
          <Button variant="outline" size="sm" onClick={onClose}>{t("common.cancel")}</Button>
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
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    try {
      setIndexes(await ipc.listIndexes(connId, db, coll));
    } catch (e) {
      setError(String(e));
    }
  };
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connId, db, coll]);

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      await ipc.createIndex(connId, db, coll, keys, unique);
      await reload();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const drop = async (name: string) => {
    if (!window.confirm(`Drop index "${name}"? Queries using it may become slower.`)) return;
    setBusy(true);
    setError(null);
    try {
      await ipc.dropIndex(connId, db, coll, name);
      await reload();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="tcn-glass-strong flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-tucano-400" />
            {t("sb.indexes")} — <span className="mono text-tucano-400">{coll}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 space-y-1 overflow-y-auto pr-1 scroll-thin">
          {indexes.map((idx) => (
            <div
              key={idx.name}
              className="flex items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2.5 text-xs"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 font-medium">
                  <KeyRound className="h-3 w-3 text-sky-400" /> {idx.name}
                </div>
                <div className="mono mt-1 truncate text-[11px] text-muted-foreground">
                  {toShellLiteral(idx.keys)}
                </div>
              </div>
              {idx.unique && (
                <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-500">
                  {t("ca.unique")}
                </span>
              )}
              {idx.name !== "_id_" && (
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => drop(idx.name)} disabled={busy} title={`Drop ${idx.name}`}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>

        <div className="shrink-0 space-y-3 rounded-md border border-border bg-muted/20 p-3">
          <div>
            <Label className="text-xs">{t("ca.newIndex")}</Label>
            <p className="mt-1 text-[11px] text-muted-foreground">Use 1 for ascending and -1 for descending, for example <span className="mono">{'{ email: 1 }'}</span>.</p>
          </div>
          <Input value={keys} onChange={(e) => setKeys(e.target.value)} className="mono text-xs" aria-label={t("ca.newIndex")} />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs">
              <Switch checked={unique} onCheckedChange={setUnique} /> {t("ca.unique")}
            </label>
            <Button size="sm" className="tcn-accent border-0 text-xs" onClick={add} disabled={busy}>
              {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1 h-3.5 w-3.5" />} {t("common.create")}
            </Button>
          </div>
        </div>
        {error && <div className="mono shrink-0 break-all rounded-md border border-destructive/40 px-3 py-2 text-xs text-destructive">{error}</div>}
      </DialogContent>
    </Dialog>
  );
}
