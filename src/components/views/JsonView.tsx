import { useMemo } from "react";
import { RawEditor } from "@/viewers/RawEditor";
import { useT } from "@/lib/i18n";

// Above this size, CodeMirror's parse/highlight pass is what freezes the UI, so
// fall back to a plain <pre> (browsers render large read-only text effortlessly).
const HIGHLIGHT_LIMIT = 1_500_000;

/** Read-only pretty JSON of the current page of documents. */
export function JsonView({ docs }: { docs: Record<string, unknown>[] }) {
  const t = useT();
  const text = useMemo(() => JSON.stringify(docs, null, 2), [docs]);

  if (text.length > HIGHLIGHT_LIMIT) {
    return (
      <div className="flex h-full flex-col p-2">
        <div className="mb-1 shrink-0 rounded-md border border-border bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground">
          {t("json.large")}
        </div>
        <pre className="mono min-h-0 flex-1 overflow-auto rounded-md border border-border bg-card/60 p-3 text-[12px] scroll-thin">
          {text}
        </pre>
      </div>
    );
  }

  return (
    <div className="h-full p-2">
      <RawEditor value={text} readOnly minHeight={0} className="h-full" />
    </div>
  );
}
