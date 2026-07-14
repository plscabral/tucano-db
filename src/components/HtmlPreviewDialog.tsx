import { Braces, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { sandboxedHtmlDocument } from "@/lib/htmlPreview";
import { useT } from "@/lib/i18n";
import { useHtmlPreview } from "@/stores/htmlPreview";

/** Opens only from a field that was positively identified as HTML. */
export function HtmlPreviewDialog() {
  const preview = useHtmlPreview((state) => state.preview);
  const close = useHtmlPreview((state) => state.close);
  const t = useT();

  if (!preview) return null;
  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="flex h-[min(82dvh,52rem)] max-h-[calc(100dvh-2rem)] flex-col gap-4 overflow-hidden sm:max-w-5xl">
        <DialogHeader className="shrink-0 pr-8">
          <DialogTitle className="flex items-center gap-2">
            <Braces className="h-4 w-4 text-tucano-400" />
            {t("html.preview")} <span className="mono text-tucano-400">{preview.path}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="flex shrink-0 items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-500" /> {t("html.safe")}
        </div>
        <iframe
          title={`${t("html.preview")}: ${preview.path}`}
          sandbox=""
          referrerPolicy="no-referrer"
          srcDoc={sandboxedHtmlDocument(preview.html)}
          className="min-h-0 flex-1 rounded-md border border-border bg-white"
        />
      </DialogContent>
    </Dialog>
  );
}
