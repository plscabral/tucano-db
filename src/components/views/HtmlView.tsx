import { useEffect, useMemo, useState } from "react";
import { FileWarning } from "lucide-react";
import { useT } from "@/lib/i18n";

type HtmlCandidate = { id: string; label: string; html: string };

const MAX_CANDIDATES = 40;
const MAX_DEPTH = 5;

function looksLikeHtml(value: string): boolean {
  return /<!doctype\s+html|<html[\s>]|<body[\s>]|<(?:div|table|p|section|article|span|h[1-6])(?:\s|>)/i.test(value);
}

function collectHtml(value: unknown, path: string, candidates: HtmlCandidate[], depth = 0) {
  if (candidates.length >= MAX_CANDIDATES || depth > MAX_DEPTH) return;
  if (typeof value === "string") {
    if (looksLikeHtml(value)) candidates.push({ id: path, label: path, html: value });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectHtml(item, `${path}[${index}]`, candidates, depth + 1));
    return;
  }
  if (value && typeof value === "object") {
    Object.entries(value as Record<string, unknown>).forEach(([key, item]) =>
      collectHtml(item, path ? `${path}.${key}` : key, candidates, depth + 1)
    );
  }
}

function sandboxedDocument(html: string): string {
  // The iframe has no script, form, popup, or same-origin permissions. The CSP
  // blocks network resources as well, so a stored email cannot track previewing.
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:"><style>html{color-scheme:light}body{margin:0;padding:20px;font:14px/1.5 system-ui,sans-serif;overflow-wrap:anywhere}img{max-width:100%;height:auto}</style></head><body>${html}</body></html>`;
}

export function HtmlView({ docs }: { docs: Record<string, unknown>[] }) {
  const t = useT();
  const candidates = useMemo(() => {
    const found: HtmlCandidate[] = [];
    docs.forEach((doc, index) => collectHtml(doc, `#${index + 1}`, found));
    return found;
  }, [docs]);
  const [selectedId, setSelectedId] = useState("");

  useEffect(() => {
    setSelectedId(candidates[0]?.id ?? "");
  }, [candidates]);

  const selected = candidates.find((candidate) => candidate.id === selectedId) ?? candidates[0];
  if (!selected) {
    return (
      <div className="grid h-full place-items-center p-6 text-center text-sm text-muted-foreground">
        <div>
          <FileWarning className="mx-auto mb-2 h-5 w-5 text-muted-foreground/60" />
          <p>{t("html.empty")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col p-2">
      <div className="mb-2 flex shrink-0 items-center gap-2">
        <label className="sr-only" htmlFor="html-source">{t("html.source")}</label>
        <select id="html-source" value={selected.id} onChange={(event) => setSelectedId(event.target.value)} className="h-8 min-w-0 max-w-md rounded-md border border-border bg-card px-2 mono text-xs">
          {candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.label}</option>)}
        </select>
        <span className="ml-auto text-[11px] text-muted-foreground">{t("html.safe")}</span>
      </div>
      <iframe title={`${t("view.html")}: ${selected.label}`} sandbox="" referrerPolicy="no-referrer" srcDoc={sandboxedDocument(selected.html)} className="min-h-0 flex-1 rounded-md border border-border bg-white" />
    </div>
  );
}
