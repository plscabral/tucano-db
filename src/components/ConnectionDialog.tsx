import { useEffect, useState } from "react";
import { Check, Loader2, Plug } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { ipc } from "@/lib/ipc";
import { useConnections } from "@/stores/connections";
import { useConnDialog } from "@/stores/connDialog";
import { CONN_COLORS, CONN_COLOR_HEX, type ConnColor } from "@/lib/types";
import { useT } from "@/lib/i18n";

type TestState = { kind: "idle" | "testing" | "ok" | "err"; msg?: string };

export function ConnectionDialog() {
  const t = useT();
  const open = useConnDialog((s) => s.isOpen);
  const editing = useConnDialog((s) => s.editing);
  const onClose = useConnDialog((s) => s.close);
  const add = useConnections((s) => s.add);
  const update = useConnections((s) => s.update);

  const [name, setName] = useState("");
  const [uri, setUri] = useState("");
  const [color, setColor] = useState<ConnColor>("teal");
  const [test, setTest] = useState<TestState>({ kind: "idle" });

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? "");
      setUri(editing?.uri ?? "mongodb://localhost:27017");
      setColor(editing?.color ?? "teal");
      setTest({ kind: "idle" });
    }
  }, [open, editing]);

  const runTest = async () => {
    setTest({ kind: "testing" });
    try {
      const version = await ipc.testConnection(uri);
      setTest({ kind: "ok", msg: `MongoDB ${version}` });
    } catch (e) {
      setTest({ kind: "err", msg: String(e) });
    }
  };

  const save = async () => {
    if (!uri.trim()) return;
    const label = name.trim() || uri.replace(/^mongodb(\+srv)?:\/\//, "").split("/")[0];
    if (editing) await update(editing.id, label, uri, color);
    else await add(label, uri, color);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="tcn-glass-strong sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plug className="h-4 w-4 text-tucano-400" />
            {editing ? t("sb.editConnection") : t("conn.new")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>{t("conn.name")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Local" />
          </div>

          <div className="space-y-1.5">
            <Label>{t("conn.uri")}</Label>
            <Input
              value={uri}
              onChange={(e) => {
                setUri(e.target.value);
                setTest({ kind: "idle" });
              }}
              className="mono text-xs"
              placeholder="mongodb://user:pass@host:27017/?authSource=admin"
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t("conn.color")}</Label>
            <div className="flex flex-wrap gap-2">
              {CONN_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={cn(
                    "h-7 w-7 rounded-full ring-2 ring-offset-2 ring-offset-background transition",
                    color === c ? "ring-tucano-400" : "ring-transparent hover:ring-border"
                  )}
                  style={{ background: CONN_COLOR_HEX[c] }}
                  aria-label={c}
                />
              ))}
            </div>
          </div>

          {test.kind !== "idle" && (
            <div
              className={cn(
                "flex items-start gap-2 rounded-md border px-3 py-2 text-xs",
                test.kind === "ok" && "border-emerald-500/40 text-emerald-500",
                test.kind === "err" && "border-destructive/40 text-destructive",
                test.kind === "testing" && "text-muted-foreground"
              )}
            >
              {test.kind === "testing" && <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" />}
              {test.kind === "ok" && <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
              <span className="min-w-0 break-words">{test.msg ?? t("conn.connecting")}</span>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={runTest} disabled={test.kind === "testing" || !uri.trim()}>
            {t("conn.test")}
          </Button>
          <Button className="tcn-accent tcn-accent-glow border-0" onClick={save} disabled={!uri.trim()}>
            {t("conn.connect")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
